import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx
import jwt
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from .data_models import Transaction

logger = logging.getLogger(__name__)
DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=5.0)

# Определяем, какие ошибки считать временными для повторов
RETRYABLE_EXCEPTIONS = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.NetworkError,
)


def _is_retryable(exc: BaseException) -> bool:
    """Retry only on transport errors and HTTP 5xx per API docs."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return isinstance(exc, RETRYABLE_EXCEPTIONS)


# Создаем декоратор retry с правильными настройками
api_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    retry=retry_if_exception(_is_retryable),
)

AUTHORIZED_CONSENT_STATUSES = {"Authorized", "AuthorizedConsent", "Active", "Approved"}
PENDING_CONSENT_STATUSES = {"AwaitingAuthorization", "Pending", "AwaitingApproval"}
FAILED_CONSENT_STATUSES = {"Rejected", "Expired", "Revoked", "Cancelled"}
_AUTHORIZED_STATUS_SET = {item.lower() for item in AUTHORIZED_CONSENT_STATUSES}
_FAILED_STATUS_SET = {item.lower() for item in FAILED_CONSENT_STATUSES}
RSA_JWT_ALGS = {"RS256", "RS384", "RS512"}


def _normalize_status_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


@dataclass
class ConsentInitResult:
    consent_id: Optional[str]
    status: str
    auto_approved: bool
    approval_url: Optional[str] = None
    request_id: Optional[str] = None

    @property
    def requires_manual_action(self) -> bool:
        return not self.auto_approved and self.status not in AUTHORIZED_CONSENT_STATUSES


class OBRAPIClient:
    """Implements the multi-step OBR consent flow."""

    def __init__(self, api_base_url: str, team_client_id: str, team_client_secret: str):
        if not all([api_base_url, team_client_id, team_client_secret]):
            raise ValueError("api_base_url, team_client_id, and team_client_secret are required.")

        self.api_base_url = api_base_url.rstrip("/")
        self.team_id = team_client_id
        self.team_secret = team_client_secret
        self._client = httpx.AsyncClient(base_url=self.api_base_url, timeout=DEFAULT_TIMEOUT)
        self._bank_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None
        self._jwks_keys: Optional[List[Dict[str, Any]]] = None
        self._token_lock = asyncio.Lock()

    async def _get_common_headers(self, bank_token: str) -> Dict[str, str]:
        """Header block shared by most outbound calls."""
        return {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": self.team_id,
            "x-fapi-interaction-id": str(uuid.uuid4()),
        }

    @api_retry
    async def _get_jwks_keys(self) -> List[Dict[str, Any]]:
        if self._jwks_keys:
            return self._jwks_keys

        logger.info("Fetching JWKS from %s/.well-known/jwks.json", self.api_base_url)
        response = await self._client.get("/.well-known/jwks.json")
        response.raise_for_status()
        self._jwks_keys = response.json().get("keys", [])
        if not self._jwks_keys:
            raise ValueError("JWKS endpoint did not return any keys.")
        return self._jwks_keys

    def invalidate_jwks_cache(self) -> None:
        """Allow callers to force JWKS refresh (e.g., after key rotation)."""
        self._jwks_keys = None

    async def _validate_jwt(self, token: str) -> Dict[str, Any]:
        """
        Decode JWT payload and verify signature when the bank provides an RSA key.
        Some sandbox banks issue HS256 tokens without a shared secret in docs, so we
        fall back to skipping signature verification in that case.
        """
        try:
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg", "RS256")
            options = {"verify_aud": False}
            key: Optional[Any] = None

            if alg in RSA_JWT_ALGS:
                kid = unverified_header.get("kid")
                if not kid:
                    raise jwt.InvalidTokenError("JWT header is missing required 'kid' for RSA algorithms.")

                jwks_keys = await self._get_jwks_keys()
                if not jwks_keys:
                    raise jwt.InvalidTokenError("No keys found in JWKS endpoint.")

                key_data: Optional[Dict[str, Any]] = next(
                    (jwks_key for jwks_key in jwks_keys if jwks_key.get("kid") == kid),
                    None,
                )
                if key_data is None:
                    raise jwt.InvalidTokenError(f"Unknown 'kid' {kid} in JWT header.")

                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
                key = public_key
                options["verify_signature"] = True
            else:
                options["verify_signature"] = False
                logger.warning(
                    "Bank %s issued JWT with unsupported alg '%s'; skipping signature verification.",
                    self.api_base_url,
                    alg,
                )

            payload = jwt.decode(
                token,
                key,
                algorithms=[alg] if options.get("verify_signature") else None,
                options=options,
            )
            return payload
        except jwt.PyJWTError as exc:
            logger.error("JWT validation failed: %s", exc)
            raise

    async def _get_bank_token(self) -> str:
        async with self._token_lock:
            if self._bank_token and self._token_expires_at and datetime.now(timezone.utc) < self._token_expires_at:
                return self._bank_token

            logger.info("Requesting new bank token from %s", self.api_base_url)
            logger.debug("Using client_id: %s (length: %d)", self.team_id, len(self.team_id) if self.team_id else 0)
            logger.debug("Using client_secret: %s (length: %d)", "***" if self.team_secret else "None", len(self.team_secret) if self.team_secret else 0)

            @api_retry
            async def _fetch_token_with_retry():
                try:
                    response = await self._client.post(
                        "/auth/bank-token",
                        params={"client_id": self.team_id, "client_secret": self.team_secret},
                    )
                    response.raise_for_status()
                    return response.json()
                except Exception as e:
                    logger.error("Failed to get bank token: %s", e)
                    logger.error("Request URL: %s/auth/bank-token?client_id=%s&client_secret=***", self.api_base_url, self.team_id)
                    raise

            token_data = await _fetch_token_with_retry()
            access_token = token_data["access_token"]

            payload = await self._validate_jwt(access_token)
            self._bank_token = access_token
            
            expires_at_timestamp = payload.get("exp", 0)
            self._token_expires_at = datetime.fromtimestamp(expires_at_timestamp, tz=timezone.utc) - timedelta(minutes=1)

            logger.info("Successfully obtained and validated new bank token.")
            return self._bank_token

    # !!! УБРАЛИ @retry ОТСЮДА !!!
    async def initiate_consent(self, user_id: str) -> ConsentInitResult:
        """
        Step 1: Create an account access consent request at the bank.
        Returns metadata about the consent, including approval URL when provided.
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        body = {
            "client_id": user_id,
            "permissions": ["ReadAccountsDetail", "ReadBalances", "ReadTransactionsDetail"],
            "reason": "Financial analysis for FinPulse Hackathon",
            "requesting_bank": self.team_id,
            "requesting_bank_name": f"{self.team_id} App",
            "redirect_uri": "http://localhost:5173/callback",
        }

        logger.info("Initiating consent for user '%s' at %s", user_id, self.api_base_url)
        
        @api_retry
        async def _post_consent_request():
            response = await self._client.post("/account-consents/request", headers=headers, json=body)
            response.raise_for_status()
            return response.json()

        response_data = await _post_consent_request()

        data_section = response_data.get("data") if isinstance(response_data, dict) else {}
        if not isinstance(data_section, dict):
            data_section = {}

        consent_id = (
            data_section.get("consentId")
            or data_section.get("consent_id")
            or (response_data.get("consentId") if isinstance(response_data, dict) else None)
            or (response_data.get("consent_id") if isinstance(response_data, dict) else None)
        )
        request_id = (
            data_section.get("requestId")
            or data_section.get("request_id")
            or (response_data.get("request_id") if isinstance(response_data, dict) else None)
            or (response_data.get("requestId") if isinstance(response_data, dict) else None)
        )

        approval_url = (
            response_data.get("links", {}).get("consentApproval")
            or response_data.get("links", {}).get("consentApprovalUrl")
            or response_data.get("links", {}).get("approvalUrl")
            or response_data.get("approvalUrl")
            or response_data.get("approval_url")
        )

        status = (
            data_section.get("status")
            or response_data.get("status") if isinstance(response_data, dict) else None
            or ("Authorized" if response_data.get("auto_approved") else "AwaitingAuthorization")
        )
        auto_approved = bool(
            response_data.get("auto_approved")
            or data_section.get("autoApproved")
            or (status in AUTHORIZED_CONSENT_STATUSES)
        )

        if not consent_id and not request_id:
            raise ValueError("API did not return a consent or request identifier.")

        if not approval_url and auto_approved:
            logger.info(
                "Consent %s appears auto-approved at %s (no approval URL).",
                consent_id,
                self.api_base_url,
            )

        logger.info(
            "Consent initiated with consent_id=%s request_id=%s (status=%s)",
            consent_id,
            request_id,
            status,
        )
        return ConsentInitResult(
            consent_id=consent_id,
            approval_url=approval_url,
            status=status,
            auto_approved=auto_approved,
            request_id=request_id,
        )

    async def initiate_product_consent(
        self, user_id: str, user_display_name: Optional[str] = None
    ) -> Optional[ConsentInitResult]:
        """Creates a product agreement consent request according to API specification.
        
        client_id is passed ONLY in query params, NOT in body.
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        url = "/product-agreement-consents/request"

        # Base payload WITHOUT client_id (it goes in query params only)
        base_payload = {
            "requesting_bank": self.team_id,
            "reason": "Финансовый агрегатор для управления продуктами",
        }

        # Primary payload according to API specification
        payloads_to_try = [
            {
                **base_payload,
                "read_product_agreements": True,
                "open_product_agreements": True,
                "close_product_agreements": False,
                "allowed_product_types": ["deposit", "loan", "card"],
                "max_amount": 1000000.00,
            },
            {
                **base_payload,
                "read_product_agreements": True,
                "open_product_agreements": True,
                "close_product_agreements": False,
                "allowed_product_types": ["deposit", "loan", "credit_card"],
                "max_amount": 5_000_000,
            },
            {
                **base_payload,
                "read_product_agreements": True,
                "open_product_agreements": False,
                "close_product_agreements": False,
                "allowed_product_types": ["deposit", "loan", "card"],
            },
            {
                **base_payload,
                "read_product_agreements": True,
            },
        ]

        for body in payloads_to_try:
            try:
                response = await self._client.post(
                    url,
                    headers=headers,
                    params={"client_id": user_id},
                    json=body,
                )
                if response.status_code >= 400:
                    logger.warning("Payload failed with status %s: %s", response.status_code, body)
                    continue

                data = response.json()
                # Extract fields according to API specification
                request_id = (
                    data.get("request_id")
                    or self._jget(data, ["data", "requestId"])
                    or self._jget(data, ["data", "request_id"])
                )
                consent_id = (
                    data.get("consent_id")
                    or self._jget(data, ["data", "consentId"])
                    or self._jget(data, ["data", "consent_id"])
                )
                status_raw = (
                    data.get("status")
                    or self._jget(data, ["data", "status"])
                )
                auto_approved = bool(
                    data.get("auto_approved")
                    or self._jget(data, ["data", "autoApproved"])
                    or self._jget(data, ["data", "auto_approved"])
                )
                approval_url = (
                    self._jget(data, ["links", "consentApproval"])
                    or self._jget(data, ["links", "approvalUrl"])
                    or data.get("approval_url")
                )

                # request_id is always present according to API spec
                if not request_id:
                    logger.warning("Product consent response missing request_id: %s", data)
                    continue

                # Normalize status
                normalized_status = _normalize_status_value(status_raw).lower() if status_raw else ""
                
                # Determine auto_approved if not explicitly set
                if not auto_approved and normalized_status:
                    auto_approved = normalized_status in _AUTHORIZED_STATUS_SET
                
                # Determine final status
                if not status_raw:
                    status_value = "Approved" if auto_approved else "Pending"
                else:
                    status_value = status_raw

                # consent_id may be None if status is "pending" (requires manual approval)
                final_consent_id = consent_id if consent_id else None

                logger.info(
                    "Product consent initiated: request_id=%s, consent_id=%s, status=%s, auto_approved=%s",
                    request_id,
                    final_consent_id,
                    status_value,
                    auto_approved,
                )
                return ConsentInitResult(
                    consent_id=final_consent_id,
                    status=status_value,
                    auto_approved=auto_approved,
                    approval_url=approval_url,
                    request_id=request_id,
                )
            except httpx.RequestError as e:  # noqa: PERF203
                logger.warning("Request failed for product consent payload %s: %s", body, e)

        logger.error("All attempts to create product consent failed for user %s at %s", user_id, self.api_base_url)
        return None

    async def initiate_payment_consent(
        self, user_id: str, user_display_name: Optional[str] = None, account_consent_id: Optional[str] = None
    ) -> Optional[ConsentInitResult]:
        """
        Creates a multi-use payment consent request according to API specification.
        
        Uses consent_type="multi_use" for multiple payments with limits.
        client_id is passed in body, NOT in query params.
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        url = "/payment-consents/request"

        # Try to get real debtor_account if account_consent_id is provided
        debtor_account: Optional[str] = None
        if account_consent_id:
            try:
                accounts = await self.fetch_accounts_with_consent(user_id, account_consent_id)
                if accounts:
                    # Use first account as debtor_account
                    debtor_account = self._extract_account_id(accounts[0])
                    logger.info("Found debtor_account: %s for user %s", debtor_account, user_id)
            except Exception as e:
                logger.warning("Failed to fetch accounts for debtor_account: %s", e)

        # Use placeholder if no real account found
        if not debtor_account:
            # Extract bank_id from api_base_url (e.g., "https://abank.open.bankingapi.ru" -> "abank")
            bank_id_from_url = self.api_base_url.split("//")[1].split(".")[0] if "//" in self.api_base_url else "bank"
            debtor_account = f"account-{user_id}-{bank_id_from_url}"
            logger.info("Using placeholder debtor_account: %s", debtor_account)

        valid_until = (
            datetime.now(timezone.utc) + timedelta(days=365)
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")

        # Base payload with client_id in body (NOT in query params)
        base_payload = {
            "requesting_bank": self.team_id,
            "client_id": user_id,
            "reason": "Финансовый агрегатор для управления платежами",
        }

        # Multi-use payment consent according to API specification
        payloads_to_try = [
            {
                **base_payload,
                "consent_type": "multi_use",
                "debtor_account": debtor_account,
                "max_uses": 100,
                "max_amount_per_payment": 100000.00,
                "max_total_amount": 1000000.00,
                "valid_until": valid_until,
            },
            {
                **base_payload,
                "consent_type": "multi_use",
                "debtor_account": debtor_account,
                "max_uses": 50,
                "max_amount_per_payment": 50000.00,
                "max_total_amount": 500000.00,
                "valid_until": valid_until,
            },
            {
                **base_payload,
                "consent_type": "multi_use",
                "debtor_account": debtor_account,
                "max_uses": 10,
                "max_amount_per_payment": 10000.00,
                "max_total_amount": 100000.00,
            },
        ]

        for body in payloads_to_try:
            try:
                # client_id is in body, NOT in query params
                response = await self._client.post(
                    url,
                    headers=headers,
                    json=body,
                )
                if response.status_code >= 400:
                    logger.warning(
                        "Payment consent payload failed with status %s: %s",
                        response.status_code,
                        body,
                    )
                    continue

                data = response.json()
                # Extract fields according to API specification
                request_id = (
                    data.get("request_id")
                    or self._jget(data, ["data", "requestId"])
                    or self._jget(data, ["data", "request_id"])
                )
                consent_id = (
                    data.get("consent_id")
                    or self._jget(data, ["data", "consentId"])
                    or self._jget(data, ["data", "consent_id"])
                )
                status_raw = (
                    data.get("status")
                    or self._jget(data, ["data", "status"])
                )
                auto_approved = bool(
                    data.get("auto_approved")
                    or self._jget(data, ["data", "autoApproved"])
                    or self._jget(data, ["data", "auto_approved"])
                )
                approval_url = (
                    self._jget(data, ["links", "consentApproval"])
                    or self._jget(data, ["links", "approvalUrl"])
                    or data.get("approval_url")
                )

                # request_id is always present according to API spec
                if not request_id:
                    logger.warning("Payment consent response missing request_id: %s", data)
                    continue

                # Normalize status
                normalized_status = _normalize_status_value(status_raw).lower() if status_raw else ""
                
                # Determine auto_approved if not explicitly set
                if not auto_approved and normalized_status:
                    auto_approved = normalized_status in _AUTHORIZED_STATUS_SET
                
                # Determine final status
                if not status_raw:
                    status_value = "Approved" if auto_approved else "Pending"
                else:
                    status_value = status_raw

                # consent_id may be None if status is "pending" (requires manual approval)
                final_consent_id = consent_id if consent_id else None

                logger.info(
                    "Payment consent initiated: request_id=%s, consent_id=%s, status=%s, auto_approved=%s",
                    request_id,
                    final_consent_id,
                    status_value,
                    auto_approved,
                )
                return ConsentInitResult(
                    consent_id=final_consent_id,
                    status=status_value,
                    auto_approved=auto_approved,
                    approval_url=approval_url,
                    request_id=request_id,
                )
            except httpx.RequestError as e:  # noqa: PERF203
                logger.warning("Request failed for payment consent payload %s: %s", body, e)

        logger.error("All attempts to create payment consent failed for user %s at %s", user_id, self.api_base_url)
        return None

    async def initiate_single_payment(
        self,
        user_id: str,
        consent_id: str,
        account_id: str,
        amount: float,
        creditor_account: str,
        description: str,
    ) -> Dict[str, Any]:
        """Инициирует single payment через банковское API."""
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        headers["X-Payment-Consent-Id"] = consent_id

        # Try multiple endpoints
        endpoints_to_try = [
            "/payments/single",
            "/payments/single-payment",
            "/single-payments",
        ]

        base_payload = {
            "client_id": user_id,
            "debtor_account": account_id,
            "creditor_account": creditor_account,
            "amount": amount,
            "currency": "RUB",
            "description": description,
            "requesting_bank": self.team_id,
        }

        payloads_to_try = [
            base_payload,
            {
                **base_payload,
                "instructed_amount": {
                    "amount": str(amount),
                    "currency": "RUB",
                },
            },
            {
                **base_payload,
                "payment_amount": amount,
                "payment_currency": "RUB",
            },
        ]

        for url in endpoints_to_try:
            for body in payloads_to_try:
                try:
                    response = await self._client.post(
                        url,
                        headers=headers,
                        params={"client_id": user_id},
                        json=body,
                    )
                    if response.status_code >= 400:
                        logger.warning(
                            "Payment request failed with status %s for endpoint %s: %s",
                            response.status_code,
                            url,
                            body,
                        )
                        continue

                    data = response.json()
                    payment_id = data.get("payment_id") or self._jget(data, ["data", "paymentId"])
                    status_raw = data.get("status") or self._jget(data, ["data", "status"])

                    if payment_id:
                        logger.info(
                            "Single payment initiated successfully with endpoint %s: payment_id=%s",
                            url,
                            payment_id,
                        )
                        return {
                            "payment_id": payment_id,
                            "status": status_raw or "Pending",
                            "amount": amount,
                            "description": description,
                        }
                except httpx.RequestError as e:  # noqa: PERF203
                    logger.warning(
                        "Request failed for payment endpoint %s with payload %s: %s",
                        url,
                        body,
                        e,
                    )

        logger.error("All attempts to initiate single payment failed for user %s at %s", user_id, self.api_base_url)
        raise Exception("Failed to initiate payment: all endpoints failed")

    @api_retry
    async def get_consent_details(self, consent_id: str) -> Dict[str, Any]:
        """Fetch consent status from /account-consents/{consent_id}."""
        response = await self._client.get(f"/account-consents/{consent_id}")
        response.raise_for_status()
        return response.json()

    @api_retry
    async def get_consent_status_by_request_id(self, request_id: str) -> Dict[str, Any]:
        """Fetch consent status when only request_id is available."""
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        response = await self._client.get(f"/account-consents/{request_id}", headers=headers)
        response.raise_for_status()
        return response.json()

    @api_retry
    async def get_product_consent_status(self, request_id: str, user_id: str) -> Dict[str, Any]:
        """
        Fetch product agreement consent status using GET /product-agreement-consents/{request_id}?client_id={user_id}.
        
        According to API spec, the same endpoint is used for both POST (create) and GET (check status).
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        params = {"client_id": user_id}
        response = await self._client.get(
            f"/product-agreement-consents/{request_id}",
            headers=headers,
            params=params,
        )
        response.raise_for_status()
        return response.json()

    async def wait_for_consent_authorization(
        self,
        consent_id: str,
        timeout_seconds: float = 300,
        poll_interval_seconds: float = 5,
    ) -> str:
        """Poll consent status until it becomes authorized or fails."""
        logger.info("Waiting for consent %s to be authorized...", consent_id)
        deadline = asyncio.get_running_loop().time() + timeout_seconds

        while True:
            consent_payload = await self.get_consent_details(consent_id)
            data_section = consent_payload.get("data", {}) if isinstance(consent_payload, dict) else {}
            status = data_section.get("status") or consent_payload.get("status") or "unknown"

            if status in AUTHORIZED_CONSENT_STATUSES:
                logger.info("Consent %s authorized with status %s.", consent_id, status)
                return status
            if status in FAILED_CONSENT_STATUSES:
                raise RuntimeError(f"Consent {consent_id} failed with status '{status}'.")

            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"Timed out waiting for consent {consent_id} authorization (last status {status}).")

            await asyncio.sleep(poll_interval_seconds)

    async def fetch_transactions_with_consent(self, user_id: str, consent_id: str) -> List[Transaction]:
        """
        Step 2: Retrieve transactions for the user using an approved consent.
        """
        bank_token = await self._get_bank_token()
        base_headers = await self._get_common_headers(bank_token)

        logger.info("Fetching accounts for user '%s' with consent '%s'", user_id, consent_id)
        headers = {**base_headers, "X-Consent-Id": consent_id}
        
        @api_retry
        async def _get_accounts():
            acc_response = await self._client.get(f"/accounts?client_id={user_id}", headers=headers)
            acc_response.raise_for_status()
            return acc_response.json()

        accounts_data = await _get_accounts()
        accounts = self._extract_accounts(accounts_data)

        all_transactions: List[Transaction] = []
        for account in accounts:
            account_id = self._extract_account_id(account)
            if not account_id:
                continue

            next_page_url: Optional[str] = f"/accounts/{account_id}/transactions?client_id={user_id}"
            page_num = 1
            while next_page_url:
                logger.info(
                    "Fetching transactions for account '%s', page %d (next=%s)",
                    account_id,
                    page_num,
                    next_page_url,
                )
                paginated_headers = {**headers, "x-fapi-interaction-id": str(uuid.uuid4())}

                @api_retry
                async def _get_transactions_page(url):
                    tx_response = await self._client.get(url, headers=paginated_headers)
                    tx_response.raise_for_status()
                    return tx_response.json()
                
                response_data = await _get_transactions_page(next_page_url)

                raw_txs = self._extract_transactions(response_data)

                for raw in raw_txs:
                    tx_model = self._to_transaction_model(raw)
                    if tx_model:
                        all_transactions.append(tx_model)
                    else:
                        logger.warning("Failed to normalize transaction payload: %s", raw)

                next_page_url = self._extract_next_link(response_data)
                logger.info(
                    "Pagination checkpoint account=%s page=%d next=%s",
                    account_id,
                    page_num,
                    next_page_url,
                )
                page_num += 1

        logger.info("Fetched %d transactions for user '%s' from %s", len(all_transactions), user_id, self.api_base_url)
        return all_transactions

    async def close(self) -> None:
        """Dispose the underlying HTTP client."""
        await self._client.aclose()

    async def fetch_accounts_with_consent(self, user_id: str, consent_id: str) -> List[Dict[str, Any]]:
        """Fetch accounts list for the user with the granted consent."""
        bank_token = await self._get_bank_token()
        headers = {**(await self._get_common_headers(bank_token)), "X-Consent-Id": consent_id}

        logger.info("Fetching accounts overview for user '%s' (consent %s)", user_id, consent_id)

        @api_retry
        async def _get_accounts():
            response = await self._client.get(f"/accounts?client_id={user_id}", headers=headers)
            response.raise_for_status()
            return response.json()

        payload = await _get_accounts()
        accounts = self._extract_accounts(payload)
        logger.info("Retrieved %d accounts for user '%s' from %s", len(accounts), user_id, self.api_base_url)
        return accounts

    async def fetch_balances_with_consent(self, user_id: str, consent_id: str) -> Dict[str, Any]:
        """Fetch balance totals for the user with the granted consent."""
        bank_token = await self._get_bank_token()
        base_headers = await self._get_common_headers(bank_token)

        logger.info("Fetching balances for user '%s' (consent %s)", user_id, consent_id)

        async def _accounts_headers() -> Dict[str, str]:
            headers = {**base_headers, "x-fapi-interaction-id": str(uuid.uuid4())}
            headers["X-Consent-Id"] = consent_id
            return headers

        @api_retry
        async def _get_accounts():
            response = await self._client.get(f"/accounts?client_id={user_id}", headers=await _accounts_headers())
            response.raise_for_status()
            return response.json()

        accounts_payload = await _get_accounts()
        accounts = self._extract_accounts(accounts_payload)

        all_balance_entries: List[Dict[str, Any]] = []
        for account in accounts:
            account_id = self._extract_account_id(account)
            if not account_id:
                continue

            url = f"/accounts/{account_id}/balances"

            @api_retry
            async def _get_account_balances():
                response = await self._client.get(url, headers=await _accounts_headers())
                response.raise_for_status()
                return response.json()

            balance_payload = await _get_account_balances()
            entries = self._extract_balances(balance_payload)  # ИСПРАВЛЕНО: используем новый метод
            if not entries:
                logger.warning("No balance entries found for account %s at %s", account_id, self.api_base_url)
                continue

            for entry in entries:
                if isinstance(entry, dict):
                    entry.setdefault("accountId", account_id)
                    all_balance_entries.append(entry)

        logger.info(
            "Retrieved %d balance entries for user '%s' from %s",
            len(all_balance_entries),
            user_id,
            self.api_base_url,
        )
        return {"balances": all_balance_entries}

    async def fetch_credits_with_consent(self, user_id: str, consent_id: str) -> List[Dict[str, Any]]:
        """
        Fetches credit agreements using multiple header variations and pagination,
        inspired by hndmd.py.
        """
        if not consent_id:
            logger.warning("fetch_credits_with_consent called without consent_id for user %s", user_id)
            return []

        bank_token = await self._get_bank_token()
        common_headers = await self._get_common_headers(bank_token)
        params: Dict[str, Any] = {"client_id": user_id}

        urls_to_try = ["/credits", "/product-agreements"]

        headers_variations = [
            {"X-Product-Agreement-Consent-Id": consent_id},
            {"x-product-agreement-consent-id": consent_id},
            {"X-Consent-Id": consent_id},
        ]

        for url in urls_to_try:
            for header_variant in headers_variations:
                headers = {**common_headers, **header_variant}
                try:
                    response = await self._client.get(url, headers=headers, params=params)
                    if response.status_code in (400, 401, 403, 404):
                        logger.warning(
                            "Request to %s failed with status %s using header %s",
                            url,
                            response.status_code,
                            list(header_variant.keys())[0],
                        )
                        continue

                    response.raise_for_status()

                    all_agreements = await self._paginate(response, headers, params)
                    credits = [ag for ag in all_agreements if self._is_credit(ag)]

                    logger.info(
                        "Successfully fetched %d credits from %s using header %s",
                        len(credits),
                        url,
                        list(header_variant.keys())[0],
                    )
                    return credits
                except httpx.RequestError as e:
                    logger.error("Network error while fetching from %s: %s", url, e)
                    raise

        logger.error("All attempts to fetch credits/agreements failed for consent %s.", consent_id)
        return []

    async def _paginate(self, first_response: httpx.Response, headers: Dict[str, str], params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Paginates through API results using the 'next' link."""
        body = first_response.json()
        items = self._extract_agreements(body) or self._extract_accounts(body)
        items = list(items) if items else []

        next_url = self._extract_next_link(body)
        while next_url:
            paginated_params = {k: v for k, v in (params or {}).items() if f"{k}=" not in next_url}

            response = await self._client.get(next_url, headers=headers, params=paginated_params or None)
            if response.status_code != 200:
                logger.warning("Pagination failed at URL %s with status %s", next_url, response.status_code)
                break

            body = response.json()
            items.extend(self._extract_agreements(body) or self._extract_accounts(body))
            next_url = self._extract_next_link(body)

        return items

    @staticmethod
    def _jget(d: Dict[str, Any], path: List[str], default: Any = None) -> Any:
        cur = d
        for p in path:
            if isinstance(cur, dict) and p in cur:
                cur = cur[p]
            else:
                return default
        return cur

    @staticmethod
    def _is_credit(agreement: Dict[str, Any]) -> bool:
        """Checks if a product agreement is a credit product."""
        prod_type = (agreement.get("product_type") or "").lower()
        name = (agreement.get("product_name") or "").lower()
        return "credit" in prod_type or "loan" in prod_type or "кредит" in name

    @staticmethod
    def _extract_accounts(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, dict):
            if isinstance(payload.get("accounts"), list):
                return payload["accounts"]
            data = payload.get("data")
            if isinstance(data, dict):
                if isinstance(data.get("accounts"), list):
                    return data["accounts"]
                if isinstance(data.get("account"), list):
                    return data["account"]
        return []

    @staticmethod
    def _extract_transactions(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, dict):
            if isinstance(payload.get("transactions"), list):
                return payload["transactions"]
            data = payload.get("data")
            if isinstance(data, dict):
                if isinstance(data.get("transactions"), list):
                    return data["transactions"]
                if isinstance(data.get("transaction"), list):
                    return data["transaction"]
        return []

    @staticmethod
    def _extract_agreements(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, dict):
            if isinstance(payload.get("agreements"), list):
                return payload["agreements"]
            if isinstance(payload.get("items"), list):
                return payload["items"]
            if isinstance(payload.get("credits"), list):
                return payload["credits"]
            data = payload.get("data")
            # Вариант 1: data - это массив напрямую (реальный формат банка)
            if isinstance(data, list):
                return data
            # Вариант 2: data - это объект с вложенными массивами
            if isinstance(data, dict):
                if isinstance(data.get("agreements"), list):
                    return data["agreements"]
                if isinstance(data.get("credits"), list):
                    return data["credits"]
                if isinstance(data.get("items"), list):
                    return data["items"]
        # Вариант 3: payload сам является массивом
        if isinstance(payload, list):
            return payload
        return []

    @staticmethod
    def _extract_balances(payload: Any) -> List[Dict[str, Any]]:
        """
        Извлекает балансы из response с поддержкой разных вариантов структуры.
        Обрабатывает как lowercase ("balance"), так и uppercase ("Balance").
        """
        if not isinstance(payload, dict):
            return []
        
        # Вариант 1: data.balance (lowercase - из реального банка)
        data = payload.get("data")
        if isinstance(data, dict):
            balance = data.get("balance")  # lowercase!
            if isinstance(balance, list):
                return balance
            
            # Вариант 2: data.Balance (uppercase - fallback для совместимости)
            balance = data.get("Balance")
            if isinstance(balance, list):
                return balance
        
        # Вариант 3: прямо в корне payload
        balance = payload.get("balance") or payload.get("Balance")
        if isinstance(balance, list):
            return balance
        
        return []
    
    @staticmethod
    def _extract_balance_entries(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [entry for entry in payload if isinstance(entry, dict)]
        if not isinstance(payload, dict):
            return []

        for candidate in ("balances", "items", "accountBalances", "account_balances"):
            section = payload.get(candidate)
            if isinstance(section, list):
                return [entry for entry in section if isinstance(entry, dict)]

        nested_data = payload.get("data")
        if isinstance(nested_data, dict):
            for candidate in ("balances", "accountBalances", "account_balances"):
                section = nested_data.get(candidate)
                if isinstance(section, list):
                    return [entry for entry in section if isinstance(entry, dict)]
        return []

    def _extract_next_link(self, payload: Any) -> Optional[str]:
        if not isinstance(payload, dict):
            return None

        next_url = (
            self._jget(payload, ["links", "next"])
            or self._jget(payload, ["Links", "next"])
            or self._jget(payload, ["data", "links", "next"])
        )

        if not next_url:
            return None

        # Поддержка относительных и абсолютных URL
        return urljoin(self.api_base_url + "/", str(next_url))

    @staticmethod
    def _extract_account_id(account_payload: Any) -> Optional[str]:
        if not isinstance(account_payload, dict):
            return None
        for key in ("accountId", "account_id", "id"):
            value = account_payload.get(key)
            if value:
                return str(value)
        return None

    @staticmethod
    def _parse_booking_datetime(raw_value: Any) -> Optional[datetime]:
        if not isinstance(raw_value, str):
            return None

        value = raw_value.strip()
        if not value:
            return None

        try:
            if value.endswith("Z"):
                value = value.replace("Z", "+00:00")
            return datetime.fromisoformat(value)
        except ValueError:
            try:
                return datetime.fromisoformat(value + "+00:00")
            except ValueError:
                return None

    @staticmethod
    def _safe_str(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _normalize_merchant_payload(raw: Any) -> Dict[str, Optional[str]]:
        if not isinstance(raw, dict):
            return {}
        merchant = {
            "merchantId": OBRAPIClient._safe_str(
                raw.get("merchantId") or raw.get("id") or raw.get("merchant_id")
            ),
            "name": OBRAPIClient._safe_str(raw.get("name")),
            "mccCode": OBRAPIClient._safe_str(raw.get("mccCode") or raw.get("mcc")),
            "category": OBRAPIClient._safe_str(raw.get("category")),
            "city": OBRAPIClient._safe_str(raw.get("city")),
            "country": OBRAPIClient._safe_str(raw.get("country")),
            "address": OBRAPIClient._safe_str(raw.get("address") or raw.get("street")),
        }
        return {key: value for key, value in merchant.items() if value}

    @staticmethod
    def _normalize_card_payload(raw: Any) -> Dict[str, Optional[str]]:
        if not isinstance(raw, dict):
            return {}
        card = {
            "maskedPan": OBRAPIClient._safe_str(raw.get("maskedPan") or raw.get("masked_pan")),
            "type": OBRAPIClient._safe_str(raw.get("type") or raw.get("scheme")),
            "name": OBRAPIClient._safe_str(raw.get("name")),
        }
        return {key: value for key, value in card.items() if value}

    @staticmethod
    def _extract_bank_transaction_code(raw: Any) -> Optional[str]:
        if raw is None:
            return None
        if isinstance(raw, str):
            return OBRAPIClient._safe_str(raw)
        if isinstance(raw, dict):
            code = OBRAPIClient._safe_str(raw.get("code"))
            subcode = OBRAPIClient._safe_str(raw.get("subCode") or raw.get("subcode"))
            if code and subcode:
                return f"{code}:{subcode}"
            return code or subcode
        return None

    def _to_transaction_model(self, raw: Any) -> Optional[Transaction]:
        if not isinstance(raw, dict):
            return None

        transaction_id = (
            raw.get("transactionId")
            or raw.get("transaction_id")
            or raw.get("id")
            or str(uuid.uuid4())
        )

        amount_payload = raw.get("amount") or raw.get("transactionAmount") or raw.get("transaction_amount")
        currency = "RUB"
        amount_value: Optional[str] = None
        if isinstance(amount_payload, dict):
            currency = amount_payload.get("currency", currency)
            amount_value = amount_payload.get("amount")
        elif amount_payload is not None:
            amount_value = amount_payload

        if amount_value is None:
            amount_value = raw.get("amount")
        if "currency" in raw and not isinstance(amount_payload, dict):
            currency = raw.get("currency") or currency

        try:
            amount = float(amount_value)
        except (TypeError, ValueError):
            return None

        indicator = raw.get("creditDebitIndicator") or raw.get("direction")
        if isinstance(indicator, str) and indicator.lower().startswith("debit"):
            amount = -abs(amount)
        elif isinstance(indicator, str) and indicator.lower().startswith("credit"):
            amount = abs(amount)

        booking_value = (
            raw.get("bookingDate")
            or raw.get("bookingDateTime")
            or raw.get("valueDate")
            or raw.get("valueDateTime")
        )
        booking_dt = self._parse_booking_datetime(booking_value)
        if booking_dt is None:
            return None

        description = (
            raw.get("transactionInformation")
            or raw.get("description")
            or raw.get("narration")
            or raw.get("statementDescription")
        )
        transaction_information = raw.get("transactionInformation")

        merchant_payload = self._normalize_merchant_payload(raw.get("merchant"))
        mcc_code = merchant_payload.get("mccCode") or self._safe_str(raw.get("mccCode") or raw.get("mcc_code"))

        bank_transaction_code = self._extract_bank_transaction_code(
            raw.get("bankTransactionCode") or raw.get("bank_transaction_code")
        )

        transaction_location = raw.get("transactionLocation") or raw.get("transaction_location") or raw.get("location")
        if not isinstance(transaction_location, dict):
            transaction_location = {}

        card_payload = self._normalize_card_payload(
            raw.get("card") or raw.get("cardInstrument") or raw.get("card_instrument")
        )

        category = self._safe_str(raw.get("category") or raw.get("transactionCategory") or raw.get("categoryCode"))

        return Transaction(
            transactionId=str(transaction_id),
            amount=amount,
            currency=str(currency),
            description=description,
            bookingDate=booking_dt.date(),
            creditDebitIndicator=self._safe_str(indicator),
            bankTransactionCode=bank_transaction_code,
            merchant=merchant_payload or {},
            mccCode=mcc_code,
            category=category,
            transactionInformation=transaction_information,
            transactionLocation=transaction_location or {},
            card=card_payload or {},
        )
