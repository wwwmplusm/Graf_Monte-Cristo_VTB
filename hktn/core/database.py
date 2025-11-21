import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

DB_FILE = "finpulse_consents.db"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StoredConsent:
    """Lightweight view of a consent record used by service layers."""

    bank_id: str
    consent_id: str
    consent_type: str = "accounts"


def get_db_connection() -> sqlite3.Connection:
    """Open a connection to the consent state database."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """Ensure the given column exists on the table, adding it if necessary."""
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}
    if column not in columns:
        logger.info("Adding column %s to table %s", column, table)
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")


def init_db() -> None:
    """Create all required tables for the application if they are absent."""
    try:
        with get_db_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS consents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    consent_id TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            _ensure_column(conn, "consents", "request_id", "TEXT")
            _ensure_column(conn, "consents", "approval_url", "TEXT")
            _ensure_column(conn, "consents", "consent_type", "TEXT")
            _ensure_column(conn, "consents", "expires_at", "TEXT")  # ISO format datetime
            # Backfill consent type for legacy rows.
            conn.execute(
                r"""
                UPDATE consents
                SET bank_id = substr(bank_id, 1, length(bank_id) - 9),
                    consent_type = COALESCE(consent_type, 'products')
                WHERE bank_id LIKE '%\_products' ESCAPE '\'
                """
            )
            conn.execute(
                """
                UPDATE consents
                SET consent_type = COALESCE(consent_type, 'accounts')
                WHERE consent_type IS NULL
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY,
                    goal_type TEXT,
                    goal_details TEXT,
                    enable_payments BOOLEAN DEFAULT 0
                );
                """
            )
            _ensure_column(conn, "user_profiles", "enable_payments", "BOOLEAN DEFAULT 0")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_product_consents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    product_type TEXT,
                    consented BOOLEAN NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, bank_id, product_id)
                );
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bank_status_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS onboarding_sessions (
                    onboarding_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_name TEXT,
                    status TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_financial_inputs (
                    user_id TEXT PRIMARY KEY,
                    salary_amount REAL,
                    next_salary_date TEXT,
                    credit_payment_amount REAL,
                    credit_payment_date TEXT,
                    repayment_speed TEXT,
                    repayment_strategy TEXT,
                    savings_target REAL,
                    savings_goal_date TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            _ensure_column(conn, "user_financial_inputs", "repayment_speed", "TEXT")
            _ensure_column(conn, "user_financial_inputs", "repayment_strategy", "TEXT")
            _ensure_column(conn, "user_financial_inputs", "savings_target", "REAL")
            _ensure_column(conn, "user_financial_inputs", "savings_goal_date", "TEXT")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS dashboard_cache (
                    user_id TEXT PRIMARY KEY,
                    dashboard_data TEXT NOT NULL,
                    synced_at TEXT NOT NULL,
                    calculated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    version INTEGER DEFAULT 1
                );
                """
            )
            
            # Кеш исходных банковских данных
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bank_data_cache (
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    data_type TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, bank_id, data_type)
                );
                """
            )
            
            # Таблицы для персистентного хранения данных
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    account_data TEXT NOT NULL,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, bank_id, account_id)
                );
                """
            )
            
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    transaction_id TEXT NOT NULL,
                    transaction_data TEXT NOT NULL,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, bank_id, transaction_id)
                );
                """
            )
            
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS balances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    balance_data TEXT NOT NULL,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS credits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bank_id TEXT NOT NULL,
                    credit_id TEXT NOT NULL,
                    credit_data TEXT NOT NULL,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, bank_id, credit_id)
                );
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_dashboard_expires 
                ON dashboard_cache(expires_at);
                """
            )
            
            # Таблица для синхронизации (предотвращение race conditions)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sync_locks (
                    user_id TEXT PRIMARY KEY,
                    locked_at TIMESTAMP NOT NULL,
                    sync_id TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL
                );
                """
            )
            
            # Индекс для быстрого поиска consents
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_consents_lookup 
                ON consents(user_id, bank_id, consent_type, status);
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bank_tokens (
                    bank_id TEXT PRIMARY KEY,
                    access_token TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    refreshed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            
            conn.commit()
        logger.info("All database tables ensured.")
    except sqlite3.Error as exc:
        logger.error("Database initialization failed: %s", exc)
        raise


def save_consent(
    user_id: str,
    bank_id: str,
    consent_id: str,
    status: str,
    request_id: Optional[str] = None,
    approval_url: Optional[str] = None,
    consent_type: str = "accounts",
    expires_at: Optional[str] = None,
) -> None:
    """Persist or update a consent record."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO consents (user_id, bank_id, consent_id, status, request_id, approval_url, consent_type, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(consent_id) DO UPDATE SET
                status=excluded.status,
                user_id=excluded.user_id,
                bank_id=excluded.bank_id,
                request_id=COALESCE(excluded.request_id, consents.request_id),
                approval_url=COALESCE(excluded.approval_url, consents.approval_url),
                consent_type=COALESCE(excluded.consent_type, consents.consent_type),
                expires_at=COALESCE(excluded.expires_at, consents.expires_at)
            """,
            (user_id, bank_id, consent_id, status, request_id, approval_url, consent_type, expires_at),
        )
        conn.commit()


def update_consent_status(consent_id: str, status: str) -> bool:
    """Set consent status; returns True if a row was updated."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "UPDATE consents SET status = ? WHERE consent_id = ?",
            (status, consent_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def update_consent_from_request(request_id: str, consent_id: str, status: str) -> bool:
    """Update a pending consent row once the real consent_id becomes available."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE consents
            SET consent_id = ?, status = ?
            WHERE request_id = ?
            """,
            (consent_id, status, request_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_consent_by_request_id(request_id: str) -> Optional[Dict[str, Any]]:
    """Return consent row by request_id if it exists."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM consents WHERE request_id = ?",
            (request_id,),
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def find_approved_consents(user_id: str, consent_type: Optional[str] = None) -> List[StoredConsent]:
    """Return structured consents filtered by approval status (and optionally type)."""
    with get_db_connection() as conn:
        sql = "SELECT bank_id, consent_id, consent_type FROM consents WHERE user_id = ? AND status = 'APPROVED'"
        params: List[Any] = [user_id]
        if consent_type:
            sql += " AND consent_type = ?"
            params.append(consent_type)
        cursor = conn.execute(sql, params)
        rows = cursor.fetchall()
    return [
        StoredConsent(
            bank_id=row["bank_id"],
            consent_id=row["consent_id"],
            consent_type=row["consent_type"] or "accounts",
        )
        for row in rows
    ]


def find_consent_by_type(
    user_id: str,
    bank_id: str,
    consent_type: str = "accounts"
) -> Optional[StoredConsent]:
    """
    Находит consent определённого типа для пользователя и банка.
    
    Args:
        user_id: ID пользователя
        bank_id: ID банка
        consent_type: тип consent ("accounts", "products", "payments")
    
    Returns:
        StoredConsent если найден approved consent, иначе None
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT bank_id, consent_id, consent_type
            FROM consents
            WHERE user_id = ? AND bank_id = ? AND consent_type = ? AND status = 'APPROVED'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id, bank_id, consent_type),
        )
        row = cursor.fetchone()
    
    if row:
        return StoredConsent(
            bank_id=row["bank_id"],
            consent_id=row["consent_id"],
            consent_type=row["consent_type"] or consent_type,
        )
    return None


def upsert_product_consents(user_id: str, items: List[Dict[str, Any]]) -> None:
    """Upsert multiple product consent records for a user."""
    if not items:
        return
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for item in items:
            cursor.execute(
                """
                INSERT INTO user_product_consents (user_id, bank_id, product_id, product_type, consented, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, bank_id, product_id) DO UPDATE SET
                    consented = excluded.consented,
                    product_type = excluded.product_type,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (
                    user_id,
                    item["bank_id"],
                    item["product_id"],
                    item.get("product_type"),
                    bool(item["consented"]),
                ),
            )
        conn.commit()
    logger.info("Upserted %d product consents for user %s", len(items), user_id)


def get_product_consents_for_user(user_id: str) -> List[Dict[str, Any]]:
    """Fetch all product consents for a given user."""
    with get_db_connection() as conn:
        cursor = conn.execute("SELECT * FROM user_product_consents WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
    return [dict(row) for row in rows]


def get_user_consents(user_id: str) -> List[Dict[str, Any]]:
    """Return all stored consents (any status) for the user."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT bank_id, consent_id, status, request_id, approval_url, created_at, consent_type FROM consents WHERE user_id = ?",
            (user_id,),
        )
        rows = cursor.fetchall()
    return [dict(row) for row in rows]


def add_bank_status_log(user_id: str, bank_id: str, operation: str, status: str, message: str) -> None:
    """Log the status of a bank operation."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO bank_status_log (user_id, bank_id, operation, status, message)
            VALUES (?, ?, ?, ?, ?);
            """,
            (user_id, bank_id, operation, status, message),
        )
        conn.commit()


def get_recent_bank_status_logs(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Fetch recent bank operation logs for a user."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM bank_status_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
            (user_id, limit),
        )
        rows = cursor.fetchall()
    return [dict(row) for row in rows]


def save_onboarding_session(
    onboarding_id: str,
    user_id: str,
    user_name: Optional[str] = None,
    status: str = "started",
) -> None:
    """Save or update an onboarding session."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO onboarding_sessions (onboarding_id, user_id, user_name, status, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(onboarding_id) DO UPDATE SET
                user_id = excluded.user_id,
                user_name = excluded.user_name,
                status = excluded.status
            """,
            (onboarding_id, user_id, user_name, status),
        )
        conn.commit()
    logger.info("Saved onboarding session %s for user %s (status=%s)", onboarding_id, user_id, status)


def get_onboarding_session(onboarding_id: str) -> Optional[Dict[str, Any]]:
    """Return onboarding session by onboarding_id if it exists."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT onboarding_id, user_id, user_name, status, created_at, completed_at
            FROM onboarding_sessions
            WHERE onboarding_id = ?
            """,
            (onboarding_id,),
        )
        row = cursor.fetchone()
    if row:
        return {
            "onboarding_id": row["onboarding_id"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "status": row["status"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }
    return None


def update_onboarding_session_status(onboarding_id: str, status: str) -> None:
    """Update onboarding session status."""
    with get_db_connection() as conn:
        if status == "completed":
            conn.execute(
                """
                UPDATE onboarding_sessions
                SET status = ?, completed_at = CURRENT_TIMESTAMP
                WHERE onboarding_id = ?
                """,
                (status, onboarding_id),
            )
        else:
            conn.execute(
                """
                UPDATE onboarding_sessions
                SET status = ?
                WHERE onboarding_id = ?
                """,
                (status, onboarding_id),
            )
        conn.commit()
    logger.info("Updated onboarding session %s status to %s", onboarding_id, status)


def commit_onboarding_session(user_id: str, banks: List[str], products: List[Dict[str, Any]], goal: Dict[str, Any]) -> None:
    """Save a summary of the completed onboarding session (legacy function, kept for compatibility)."""
    # This function is kept for backward compatibility but uses the new structure
    # Generate a new onboarding_id for this session
    import uuid
    onboarding_id = str(uuid.uuid4())
    save_onboarding_session(onboarding_id, user_id, status="completed")
    logger.info("Committed onboarding session for user %s (legacy)", user_id)


def get_latest_onboarding_session(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the most recent onboarding session snapshot if it exists."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT user_id, banks_connected, products_consented, goal_profile, completed_at
            FROM onboarding_sessions
            WHERE user_id = ?
            ORDER BY completed_at DESC
            LIMIT 1;
            """,
            (user_id,),
        )
        row = cursor.fetchone()

    if row:
        return {
            "onboarding_id": row["onboarding_id"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "status": row["status"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }
    return None


def get_user_goal(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the last saved user goal."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT goal_type, goal_details FROM user_profiles WHERE user_id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    goal_details = json.loads(row["goal_details"]) if row["goal_details"] else {}
    return {"goal_type": row["goal_type"], "goal_details": goal_details}


def save_user_profile(user_id: str, goal_type: str, goal_details: Dict[str, Any]) -> None:
    """Upsert the user's selected goal details."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_profiles (user_id, goal_type, goal_details)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                goal_type = excluded.goal_type,
                goal_details = excluded.goal_details
            """,
            (user_id, goal_type, json.dumps(goal_details)),
        )
        conn.commit()
    logger.info("Saved profile for user %s (goal=%s)", user_id, goal_type)


def upsert_user_financial_inputs(
    user_id: str,
    salary_amount: Optional[float] = None,
    next_salary_date: Optional[str] = None,
    credit_payment_amount: Optional[float] = None,
    credit_payment_date: Optional[str] = None,
    repayment_speed: Optional[str] = None,
    repayment_strategy: Optional[str] = None,
    savings_target: Optional[float] = None,
    savings_goal_date: Optional[str] = None,
) -> None:
    """Persist salary/credit metadata and onboarding settings used by the simplified analytics flow."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_financial_inputs (
                user_id, salary_amount, next_salary_date, credit_payment_amount, credit_payment_date,
                repayment_speed, repayment_strategy, savings_target, savings_goal_date, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                salary_amount = COALESCE(excluded.salary_amount, user_financial_inputs.salary_amount),
                next_salary_date = COALESCE(excluded.next_salary_date, user_financial_inputs.next_salary_date),
                credit_payment_amount = COALESCE(excluded.credit_payment_amount, user_financial_inputs.credit_payment_amount),
                credit_payment_date = COALESCE(excluded.credit_payment_date, user_financial_inputs.credit_payment_date),
                repayment_speed = COALESCE(excluded.repayment_speed, user_financial_inputs.repayment_speed),
                repayment_strategy = COALESCE(excluded.repayment_strategy, user_financial_inputs.repayment_strategy),
                savings_target = COALESCE(excluded.savings_target, user_financial_inputs.savings_target),
                savings_goal_date = COALESCE(excluded.savings_goal_date, user_financial_inputs.savings_goal_date),
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                user_id, salary_amount, next_salary_date, credit_payment_amount, credit_payment_date,
                repayment_speed, repayment_strategy, savings_target, savings_goal_date
            ),
        )
        conn.commit()


def get_user_financial_inputs(user_id: str) -> Optional[Dict[str, Any]]:
    """Return stored salary/payment metadata and onboarding settings for a user if present."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT user_id, salary_amount, next_salary_date, credit_payment_amount, credit_payment_date,
                   repayment_speed, repayment_strategy, savings_target, savings_goal_date
            FROM user_financial_inputs
            WHERE user_id = ?
            """,
            (user_id,),
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def get_cached_dashboard(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Получает кешированный dashboard из БД.
    
    Returns:
        Dict с ключами: dashboard_data, synced_at, calculated_at, expires_at
        или None если кеш не найден или устарел
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT dashboard_data, synced_at, calculated_at, expires_at
            FROM dashboard_cache
            WHERE user_id = ? AND expires_at > datetime('now')
            """,
            (user_id,),
        )
        row = cursor.fetchone()
    
    if row:
        try:
            return {
                "dashboard_data": json.loads(row["dashboard_data"]),
                "synced_at": row["synced_at"],
                "calculated_at": row["calculated_at"],
                "expires_at": row["expires_at"],
            }
        except json.JSONDecodeError:
            logger.warning("Failed to parse cached dashboard data for user %s", user_id)
            return None
    return None


def save_dashboard_cache(user_id: str, dashboard_data: Dict[str, Any], ttl_minutes: int = 30) -> None:
    """
    Сохраняет dashboard в кеш.
    
    Args:
        user_id: ID пользователя
        dashboard_data: Данные dashboard для сохранения
        ttl_minutes: Время жизни кеша в минутах (по умолчанию 30)
    """
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=ttl_minutes)
    
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO dashboard_cache 
            (user_id, dashboard_data, synced_at, calculated_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                dashboard_data = excluded.dashboard_data,
                synced_at = excluded.synced_at,
                calculated_at = excluded.calculated_at,
                expires_at = excluded.expires_at
            """,
            (
                user_id,
                json.dumps(dashboard_data),
                now.isoformat(),
                now.isoformat(),
                expires_at.isoformat(),
            ),
        )
        conn.commit()
    logger.info("Saved dashboard cache for user %s (expires at %s)", user_id, expires_at.isoformat())


def invalidate_dashboard_cache(user_id: str) -> None:
    """
    Инвалидирует кеш dashboard для пользователя.
    
    Args:
        user_id: ID пользователя
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM dashboard_cache WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
        if cursor.rowcount > 0:
            logger.info("Invalidated dashboard cache for user %s", user_id)


def store_bank_token(bank_id: str, token: str, expires_at: datetime) -> None:
    """Persist a bank token with its expiration time."""
    expires_str = expires_at.astimezone(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO bank_tokens (bank_id, access_token, expires_at, refreshed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(bank_id) DO UPDATE SET
                access_token = excluded.access_token,
                expires_at = excluded.expires_at,
                refreshed_at = CURRENT_TIMESTAMP
            """,
            (bank_id, token, expires_str),
        )
        conn.commit()


def get_cached_bank_token(bank_id: str) -> Optional[Dict[str, Any]]:
    """
    Return a cached bank token if it is still valid.
    
    Tokens expiring in the next 60 seconds are considered stale.
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT access_token, expires_at
            FROM bank_tokens
            WHERE bank_id = ?
            """,
            (bank_id,),
        )
        row = cursor.fetchone()

    if not row:
        return None

    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError) as exc:
        logger.warning("Invalid expires_at for bank %s token: %s", bank_id, exc)
        return None

    # Consider tokens too close to expiry as stale
    if expires_at <= datetime.now(timezone.utc) + timedelta(seconds=60):
        return None

    return {"access_token": row["access_token"], "expires_at": expires_at}


def invalidate_bank_token(bank_id: str) -> None:
    """Remove stored token for a bank (e.g., after 401)."""
    with get_db_connection() as conn:
        conn.execute("DELETE FROM bank_tokens WHERE bank_id = ?", (bank_id,))
        conn.commit()


def cleanup_expired_cache() -> None:
    """Удаляет устаревшие кеши из БД."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM dashboard_cache WHERE expires_at < datetime('now')"
        )
        conn.commit()
        deleted_count = cursor.rowcount
        if deleted_count > 0:
            logger.info("Cleaned up %d expired dashboard cache entries", deleted_count)


def save_accounts(user_id: str, bank_id: str, accounts: List[Dict[str, Any]]) -> None:
    """Save accounts data to database."""
    if not accounts:
        return
    with get_db_connection() as conn:
        for account in accounts:
            account_id = account.get("accountId") or account.get("account_id")
            if not account_id:
                continue
            conn.execute(
                """
                INSERT INTO accounts (user_id, bank_id, account_id, account_data, synced_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, bank_id, account_id) DO UPDATE SET
                    account_data = excluded.account_data,
                    synced_at = CURRENT_TIMESTAMP
                """,
                (user_id, bank_id, account_id, json.dumps(account)),
            )
        conn.commit()
    logger.info("Saved %d accounts for user %s, bank %s", len(accounts), user_id, bank_id)


def save_transactions(user_id: str, bank_id: str, account_id: str, transactions: List[Dict[str, Any]]) -> None:
    """Save transactions data to database."""
    if not transactions:
        return
    with get_db_connection() as conn:
        for tx in transactions:
            tx_id = tx.get("transactionId") or tx.get("transaction_id") or tx.get("id")
            if not tx_id:
                continue
            conn.execute(
                """
                INSERT INTO transactions (user_id, bank_id, account_id, transaction_id, transaction_data, synced_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, bank_id, transaction_id) DO UPDATE SET
                    transaction_data = excluded.transaction_data,
                    synced_at = CURRENT_TIMESTAMP
                """,
                (user_id, bank_id, account_id, tx_id, json.dumps(tx)),
            )
        conn.commit()
    logger.info("Saved %d transactions for user %s, bank %s, account %s", len(transactions), user_id, bank_id, account_id)


def save_balances(user_id: str, bank_id: str, account_id: str, balances: List[Dict[str, Any]]) -> None:
    """Save balances data to database."""
    if not balances:
        return
    with get_db_connection() as conn:
        for balance in balances:
            conn.execute(
                """
                INSERT INTO balances (user_id, bank_id, account_id, balance_data, synced_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (user_id, bank_id, account_id, json.dumps(balance)),
            )
        conn.commit()
    logger.info("Saved %d balances for user %s, bank %s, account %s", len(balances), user_id, bank_id, account_id)


def save_credits(user_id: str, bank_id: str, credits: List[Dict[str, Any]]) -> None:
    """Save credits data to database."""
    if not credits:
        return
    with get_db_connection() as conn:
        for credit in credits:
            credit_id = credit.get("agreementId") or credit.get("agreement_id") or credit.get("id")
            if not credit_id:
                continue
            conn.execute(
                """
                INSERT INTO credits (user_id, bank_id, credit_id, credit_data, synced_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, bank_id, credit_id) DO UPDATE SET
                    credit_data = excluded.credit_data,
                    synced_at = CURRENT_TIMESTAMP
                """,
                (user_id, bank_id, credit_id, json.dumps(credit)),
            )
        conn.commit()
    logger.info("Saved %d credits for user %s, bank %s", len(credits), user_id, bank_id)


def save_bank_data_cache(
    user_id: str,
    bank_id: str,
    data_type: str,
    data: Any,
) -> None:
    """Сохраняет данные банка в кеш с timestamp."""
    from datetime import datetime
    
    fetched_at = datetime.utcnow().isoformat()
    
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO bank_data_cache (user_id, bank_id, data_type, data_json, fetched_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, bank_id, data_type) DO UPDATE SET
                data_json = excluded.data_json,
                fetched_at = excluded.fetched_at
            """,
            (user_id, bank_id, data_type, json.dumps(data), fetched_at),
        )
        conn.commit()
    logger.info("Saved %s data for user %s, bank %s at %s", data_type, user_id, bank_id, fetched_at)


def get_bank_data_cache(user_id: str, bank_id: str, data_type: str) -> Optional[Dict[str, Any]]:
    """Получает кешированные данные банка."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT data_json, fetched_at
            FROM bank_data_cache
            WHERE user_id = ? AND bank_id = ? AND data_type = ?
            """,
            (user_id, bank_id, data_type),
        )
        row = cursor.fetchone()
    
    if row:
        try:
            return {
                "data": json.loads(row["data_json"]),
                "fetched_at": row["fetched_at"],
            }
        except json.JSONDecodeError:
            logger.warning("Failed to parse cached %s data for user %s, bank %s", data_type, user_id, bank_id)
            return None
    return None


# ============================================================
# Sync Lock Management (для предотвращения race conditions)
# ============================================================

def acquire_sync_lock(user_id: str, sync_id: str, ttl_seconds: int = 300) -> bool:
    """
    Попытка получить лок для синхронизации пользователя.
    
    Args:
        user_id: ID пользователя
        sync_id: Уникальный ID синхронизации
        ttl_seconds: Время жизни лока в секундах (по умолчанию 5 минут)
    
    Returns:
        True если лок успешно получен, False если уже заблокирован
    """
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=ttl_seconds)
    
    with get_db_connection() as conn:
        # Сначала проверяем, есть ли активный лок
        cursor = conn.execute(
            """
            SELECT sync_id, expires_at 
            FROM sync_locks 
            WHERE user_id = ? AND expires_at > ?
            """,
            (user_id, now.isoformat()),
        )
        existing = cursor.fetchone()
        
        if existing:
            logger.warning("Sync already in progress for user %s (sync_id=%s)", user_id, existing["sync_id"])
            return False
        
        # Удаляем старый истекший лок если есть
        conn.execute("DELETE FROM sync_locks WHERE user_id = ?", (user_id,))
        
        # Создаём новый лок
        conn.execute(
            """
            INSERT INTO sync_locks (user_id, locked_at, sync_id, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, now.isoformat(), sync_id, expires_at.isoformat()),
        )
        conn.commit()
        logger.info("Acquired sync lock for user %s (sync_id=%s, expires=%s)", user_id, sync_id, expires_at.isoformat())
        return True


def release_sync_lock(user_id: str) -> None:
    """
    Освобождает лок синхронизации для пользователя.
    
    Args:
        user_id: ID пользователя
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM sync_locks WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
        if cursor.rowcount > 0:
            logger.info("Released sync lock for user %s", user_id)


def get_sync_lock(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Получает информацию о текущем локе синхронизации.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        Dict с данными лока или None если лок отсутствует/истёк
    """
    from datetime import datetime
    
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT user_id, sync_id, locked_at, expires_at
            FROM sync_locks
            WHERE user_id = ? AND expires_at > ?
            """,
            (user_id, datetime.utcnow().isoformat()),
        )
        row = cursor.fetchone()
    
    return dict(row) if row else None


def is_sync_locked(user_id: str) -> bool:
    """
    Проверяет, заблокирована ли синхронизация для пользователя.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        True если синхронизация заблокирована (лок активен)
    """
    return get_sync_lock(user_id) is not None
