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
            "X-Fapi-Interaction-Id": str(uuid.uuid4()),
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

            @api_retry
            async def _fetch_token_with_retry():
                response = await self._client.post(
                    "/auth/bank-token",
                    params={"client_id": self.team_id, "client_secret": self.team_secret},
                )
                response.raise_for_status()
                return response.json()

            token_data = await _fetch_token_with_retry()
            access_token = token_data["access_token"]

            payload = await self._validate_jwt(access_token)
            self._bank_token = access_token
            
            expires_at_timestamp = payload.get("exp", 0)
            self._token_expires_at = datetime.fromtimestamp(expires_at_timestamp, tz=timezone.utc) - timedelta(minutes=1)

            logger.info("Successfully obtained and validated new bank token.")
            return self._bank_token

    async def initiate_consent(self, user_id: str) -> ConsentInitResult:
        """
        Step 1: Create an account access consent request at the bank.
        Strictly follows openapi.json:
        - Path: POST /account-consents/request
        - Body: ConsentRequestBody (flat)
        - Headers: X-Requesting-Bank
        - Params: None (client_id is in body)
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        
        # openapi.json: ConsentRequestBody
        body = {
            "client_id": user_id,
            "permissions": ["ReadAccountsDetail", "ReadBalances", "ReadTransactionsDetail"],
            "reason": "Financial analysis for FinPulse Hackathon",
            "requesting_bank": self.team_id,
            "requesting_bank_name": f"{self.team_id} App",
        }

        logger.info("Initiating consent for user '%s' at %s", user_id, self.api_base_url)
        
        @api_retry
        async def _post_consent_request():
            # openapi.json does NOT list client_id as query param for this endpoint
            response = await self._client.post(
                "/account-consents/request",
                headers=headers,
                json=body,
            )
            response.raise_for_status()
            return response.json()

        response_data = await _post_consent_request()

        # Response handling based on description example:
        # {"status": "approved", "consent_id": "consent-abc123", "auto_approved": true}
        # But we also check for nested data just in case, as GET returns wrapped data.
        
        data_section = response_data.get("data") if isinstance(response_data, dict) else {}
        if not isinstance(data_section, dict):
            data_section = {}

        consent_id = (
            response_data.get("consent_id")
            or response_data.get("consentId")
            or data_section.get("consentId")
            or data_section.get("consent_id")
        )
        
        # request_id might not be in the response based on example, but we check
        request_id = (
            response_data.get("request_id")
            or response_data.get("requestId")
            or data_section.get("requestId")
            or data_section.get("request_id")
        )

        # Approval URL might be in links
        approval_url = (
            response_data.get("links", {}).get("consentApproval")
            or response_data.get("links", {}).get("consentApprovalUrl")
            or response_data.get("links", {}).get("approvalUrl")
            or response_data.get("approvalUrl")
            or response_data.get("approval_url")
        )

        status = (
            response_data.get("status")
            or data_section.get("status")
            or ("Authorized" if response_data.get("auto_approved") else "AwaitingAuthorization")
        )
        
        auto_approved = bool(
            response_data.get("auto_approved")
            or data_section.get("autoApproved")
            or (status in AUTHORIZED_CONSENT_STATUSES)
        )

        if not consent_id and not request_id:
            logger.error("Response data: %s", response_data)
            raise ValueError("API did not return a consent or request identifier.")

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
    ) -> ConsentInitResult:
        """
        Creates a product agreement consent (Extension API).
        Strictly follows openapi.json:
        - Path: POST /product-agreement-consents/request
        - Body: ProductAgreementConsentRequestData (flat)
        - Params: client_id (Required)
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        
        # openapi.json: ProductAgreementConsentRequestData
        body = {
            "requesting_bank": self.team_id,
            "read_product_agreements": True,
            "open_product_agreements": True,
            "close_product_agreements": True,
            "allowed_product_types": ["deposit", "loan", "card", "account"],
            "max_amount": 10000000.00,
            "reason": "FinPulse Product Management",
        }

        logger.info("Initiating product consent for %s at %s", user_id, self.api_base_url)

        @api_retry
        async def _post_product_consent():
            # openapi.json REQUIRES client_id in query params for this endpoint
            response = await self._client.post(
                "/product-agreement-consents/request",
                headers=headers,
                json=body,
                params={"client_id": user_id},
            )
            response.raise_for_status()
            return response.json()

        response_data = await _post_product_consent()
        
        # Response example:
        # {"request_id": "...", "consent_id": "...", "status": "approved", "auto_approved": true}
        
        consent_id = response_data.get("consent_id") or response_data.get("consentId")
        request_id = response_data.get("request_id") or response_data.get("requestId")
        status = response_data.get("status") or "pending"
        auto_approved = bool(response_data.get("auto_approved") or response_data.get("autoApproved"))
        
        approval_url = (
             response_data.get("links", {}).get("consentApproval")
             or response_data.get("approval_url")
        )

        return ConsentInitResult(
            consent_id=consent_id,
            request_id=request_id,
            status=status,
            auto_approved=auto_approved,
            approval_url=approval_url,
        )

    async def initiate_payment_consent(
        self,
        user_id: str,
        debtor_account: str,
        consent_type: str = "vrp",
        amount: Optional[float] = None,
        creditor_account: Optional[str] = None,
        creditor_name: Optional[str] = None,
        reference: Optional[str] = None,
        vrp_max_individual_amount: Optional[float] = None,
        vrp_daily_limit: Optional[float] = None,
        vrp_monthly_limit: Optional[float] = None,
        max_uses: Optional[int] = None,
        max_amount_per_payment: Optional[float] = None,
        max_total_amount: Optional[float] = None,
        allowed_creditor_accounts: Optional[List[str]] = None,
        valid_until: Optional[str] = None,
    ) -> ConsentInitResult:
        """
        Creates a payment consent.
        Strictly follows openapi.json:
        - Path: POST /payment-consents/request
        - Body: PaymentConsentRequestData (flat)
        - Params: None
        
        Args:
            user_id: Client ID
            debtor_account: Account to debit from (required)
            consent_type: "single_use", "multi_use", or "vrp" (default: "vrp")
            amount: Amount for single_use consent
            creditor_account: Specific creditor account (for single_use or multi_use with restrictions)
            creditor_name: Creditor name
            reference: Payment reference
            vrp_max_individual_amount: Max amount per payment for VRP
            vrp_daily_limit: Daily limit for VRP
            vrp_monthly_limit: Monthly limit for VRP
            max_uses: Max number of uses for multi_use
            max_amount_per_payment: Max amount per payment for multi_use
            max_total_amount: Max total amount for multi_use
            allowed_creditor_accounts: Allowed creditor accounts for multi_use
            valid_until: Expiration datetime
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        
        # openapi.json: PaymentConsentRequestData
        body = {
            "requesting_bank": self.team_id,
            "client_id": user_id,
            "consent_type": consent_type,
            "currency": "RUB",
            "debtor_account": debtor_account,
        }
        
        # Add fields based on consent type
        if consent_type == "single_use":
            if amount is not None:
                body["amount"] = amount
            if creditor_account:
                body["creditor_account"] = creditor_account
            if creditor_name:
                body["creditor_name"] = creditor_name
            if reference:
                body["reference"] = reference
        elif consent_type == "multi_use":
            if max_uses is not None:
                body["max_uses"] = max_uses
            if max_amount_per_payment is not None:
                body["max_amount_per_payment"] = max_amount_per_payment
            if max_total_amount is not None:
                body["max_total_amount"] = max_total_amount
            if allowed_creditor_accounts:
                body["allowed_creditor_accounts"] = allowed_creditor_accounts
            if valid_until:
                body["valid_until"] = valid_until
        elif consent_type == "vrp":
            if vrp_max_individual_amount is not None:
                body["vrp_max_individual_amount"] = vrp_max_individual_amount
            if vrp_daily_limit is not None:
                body["vrp_daily_limit"] = vrp_daily_limit
            if vrp_monthly_limit is not None:
                body["vrp_monthly_limit"] = vrp_monthly_limit
            if valid_until:
                body["valid_until"] = valid_until

        logger.info("Initiating payment consent (type=%s) for %s", consent_type, user_id)

        @api_retry
        async def _post_payment_consent():
            # openapi.json does NOT list client_id as query param
            response = await self._client.post(
                "/payment-consents/request",
                headers=headers,
                json=body,
            )
            response.raise_for_status()
            return response.json()

        response_data = await _post_payment_consent()
        
        consent_id = response_data.get("consent_id") or response_data.get("consentId")
        status = response_data.get("status") or "pending"
        approval_url = response_data.get("links", {}).get("consentApproval")
        auto_approved = bool(response_data.get("auto_approved") or response_data.get("autoApproved"))

        return ConsentInitResult(
            consent_id=consent_id,
            status=status,
            approval_url=approval_url,
            auto_approved=auto_approved,
        )

    async def initiate_single_payment(
        self,
        user_id: str,
        consent_id: str,
        account_id: str,
        amount: float,
        creditor_account: str,
        description: str,
    ) -> Dict[str, Any]:
        """
        Initiates a single payment.
        Strictly follows openapi.json:
        - Path: POST /payments
        - Body: PaymentRequest (wrapped in data.initiation)
        - Headers: X-Payment-Consent-Id
        - Params: client_id (Required for bank_token)
        """
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        headers["X-Payment-Consent-Id"] = consent_id
        
        # openapi.json: PaymentRequest -> data -> initiation
        body = {
            "data": {
                "initiation": {
                    "instructedAmount": {
                        "amount": str(amount),
                        "currency": "RUB"
                    },
                    "debtorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": account_id
                    },
                    "creditorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": creditor_account
                    },
                    "comment": description
                }
            }
        }

        @api_retry
        async def _post_payment():
            # openapi.json: client_id IS required in query for bank_token
            response = await self._client.post(
                "/payments",
                headers=headers,
                json=body,
                params={"client_id": user_id}
            )
            response.raise_for_status()
            return response.json()

        return await _post_payment()


    @api_retry
    async def get_consent_details(self, consent_id: str) -> Dict[str, Any]:
        """Fetch consent status from /account-consents/{consent_id}."""
        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        response = await self._client.get(f"/account-consents/{consent_id}", headers=headers)
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

    async def fetch_transactions_with_consent(
        self,
        user_id: str,
        consent_id: str,
        from_booking_date_time: Optional[str] = None,
        to_booking_date_time: Optional[str] = None,
    ) -> List[Transaction]:
        """
        Step 2: Retrieve transactions for the user using an approved consent.
        Uses page/limit pagination as per OpenAPI spec (default: page=1, limit=50, max limit=500).
        """
        bank_token = await self._get_bank_token()
        base_headers = await self._get_common_headers(bank_token)

        logger.info("Fetching accounts for user '%s' with consent '%s'", user_id, consent_id)
        headers = {**base_headers, "X-Consent-Id": consent_id}
        
        @api_retry
        async def _get_accounts():
            acc_response = await self._client.get("/accounts", headers=headers, params={"client_id": user_id})
            acc_response.raise_for_status()
            return acc_response.json()

        accounts_data = await _get_accounts()
        accounts = self._extract_accounts(accounts_data)

        all_transactions: List[Transaction] = []
        for account in accounts:
            account_id = self._extract_account_id(account)
            if not account_id:
                continue

            page_num = 1
            limit = 500  # Max limit per OpenAPI spec
            has_more = True

            while has_more:
                logger.info(
                    "Fetching transactions for account '%s', page %d (limit=%d)",
                    account_id,
                    page_num,
                    limit,
                )
                paginated_headers = {**headers, "X-Fapi-Interaction-Id": str(uuid.uuid4())}

                @api_retry
                async def _get_transactions_page():
                    params = {
                        "client_id": user_id,
                        "page": page_num,
                        "limit": limit,
                    }
                    if from_booking_date_time:
                        params["from_booking_date_time"] = from_booking_date_time
                    if to_booking_date_time:
                        params["to_booking_date_time"] = to_booking_date_time
                    
                    tx_response = await self._client.get(
                        f"/accounts/{account_id}/transactions",
                        headers=paginated_headers,
                        params=params,
                    )
                    tx_response.raise_for_status()
                    return tx_response.json()
                
                response_data = await _get_transactions_page()
                raw_txs = self._extract_transactions(response_data)

                for raw in raw_txs:
                    tx_model = self._to_transaction_model(raw)
                    if tx_model:
                        all_transactions.append(tx_model)
                    else:
                        logger.warning("Failed to normalize transaction payload: %s", raw)

                # Check if there are more pages
                # If we got fewer transactions than limit, we're on the last page
                has_more = len(raw_txs) >= limit
                page_num += 1
                
                logger.info(
                    "Pagination checkpoint account=%s page=%d fetched=%d has_more=%s",
                    account_id,
                    page_num - 1,
                    len(raw_txs),
                    has_more,
                )

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
            response = await self._client.get("/accounts", headers=headers, params={"client_id": user_id})
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
            headers = {**base_headers, "X-Fapi-Interaction-Id": str(uuid.uuid4())}
            headers["X-Consent-Id"] = consent_id
            return headers

        @api_retry
        async def _get_accounts():
            response = await self._client.get("/accounts", headers=await _accounts_headers(), params={"client_id": user_id})
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
        Fetches product agreements and filters for credits.
        Strictly follows openapi.json:
        - Path: GET /product-agreements
        - Headers: X-Product-Agreement-Consent-Id
        - Params: client_id
        """
        if not consent_id:
            logger.warning("fetch_credits_with_consent called without consent_id for user %s", user_id)
            return []

        bank_token = await self._get_bank_token()
        headers = await self._get_common_headers(bank_token)
        headers["X-Product-Agreement-Consent-Id"] = consent_id
        
        params = {"client_id": user_id}
        url = "/product-agreements"

        try:
            response = await self._client.get(url, headers=headers, params=params)
            response.raise_for_status()

            all_agreements = await self._paginate(response, headers, params)
            credits = [ag for ag in all_agreements if self._is_credit(ag)]

            logger.info(
                "Successfully fetched %d credits from %s",
                len(credits),
                url,
            )
            return credits
        except httpx.RequestError as e:
            logger.error("Network error while fetching from %s: %s", url, e)
            raise
        except Exception as e:
            logger.error("Error fetching credits: %s", e)
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
            # Check inside 'data' first (Standard)
            data = payload.get("data")
            if isinstance(data, dict):
                for key in ("accounts", "account", "Accounts", "Account", "items"):
                    val = data.get(key)
                    if isinstance(val, list):
                        return val
            
            # Check root (Non-standard)
            for key in ("accounts", "account", "Accounts", "Account", "items"):
                val = payload.get(key)
                if isinstance(val, list):
                    return val
        return []

    @staticmethod
    def _extract_transactions(payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, dict):
            # Check inside 'data' first (Standard)
            data = payload.get("data")
            if isinstance(data, dict):
                for key in ("transactions", "transaction", "Transactions", "Transaction", "items"):
                    val = data.get(key)
                    if isinstance(val, list):
                        return val
            
            # Check root (Non-standard)
            for key in ("transactions", "transaction", "Transactions", "Transaction", "items"):
                val = payload.get(key)
                if isinstance(val, list):
                    return val
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
        Обрабатывает как lowercase ("balance"), так и uppercase ("Balance"),
        а также множественное число ("balances", "accountBalances").
        """
        if not isinstance(payload, dict):
            return []
        
        # 1. Проверяем внутри data (стандарт OBR)
        data = payload.get("data")
        if isinstance(data, dict):
            # Приоритет: balances -> balance -> accountBalances -> Balance
            for key in ("balances", "balance", "accountBalances", "Balance", "items"):
                val = data.get(key)
                if isinstance(val, list):
                    return val
        
        # 2. Проверяем в корне (нестандартные реализации)
        for key in ("balances", "balance", "accountBalances", "Balance", "items"):
            val = payload.get(key)
            if isinstance(val, list):
                return val
        
        return []
    
    @staticmethod
    def _extract_balance_entries(payload: Any) -> List[Dict[str, Any]]:
        # Deprecated alias for _extract_balances but kept for compatibility if used elsewhere
        return OBRAPIClient._extract_balances(payload)

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
        for key in ("accountId", "account_id", "id", "resourceId"):
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
