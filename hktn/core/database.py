import json
import logging
import sqlite3
from dataclasses import dataclass
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
            # Backfill consent type for legacy rows.
            conn.execute(
                """
                UPDATE consents
                SET bank_id = substr(bank_id, 1, length(bank_id) - 9),
                    consent_type = COALESCE(consent_type, 'products')
                WHERE bank_id LIKE '%\_products' ESCAPE '\\'
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
                    goal_details TEXT
                );
                """
            )

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
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    banks_connected TEXT,
                    products_consented TEXT,
                    goal_profile TEXT,
                    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
) -> None:
    """Persist or update a consent record."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO consents (user_id, bank_id, consent_id, status, request_id, approval_url, consent_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(consent_id) DO UPDATE SET
                status=excluded.status,
                user_id=excluded.user_id,
                bank_id=excluded.bank_id,
                request_id=COALESCE(excluded.request_id, consents.request_id),
                approval_url=COALESCE(excluded.approval_url, consents.approval_url),
                consent_type=COALESCE(excluded.consent_type, consents.consent_type)
            """,
            (user_id, bank_id, consent_id, status, request_id, approval_url, consent_type),
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


def commit_onboarding_session(user_id: str, banks: List[str], products: List[Dict[str, Any]], goal: Dict[str, Any]) -> None:
    """Save a summary of the completed onboarding session."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO onboarding_sessions (user_id, banks_connected, products_consented, goal_profile)
            VALUES (?, ?, ?, ?);
            """,
            (user_id, json.dumps(banks), json.dumps(products), json.dumps(goal)),
        )
        conn.commit()
    logger.info("Committed onboarding session for user %s", user_id)


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

    if not row:
        return None

    def _safe_parse(value: Optional[str], default: Any) -> Any:
        if not value:
            return default
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default

    return {
        "user_id": row["user_id"],
        "banks_connected": _safe_parse(row["banks_connected"], []),
        "products_consented": _safe_parse(row["products_consented"], []),
        "goal_profile": _safe_parse(row["goal_profile"], {}),
        "completed_at": row["completed_at"],
    }


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
