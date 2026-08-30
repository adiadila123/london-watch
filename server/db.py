"""SQLite connection helpers, schema bootstrap, and the IP-hash based
anti-abuse logic that used to live in supabase-confirmations.sql /
supabase-ratelimit.sql as Postgres SECURITY DEFINER functions.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"

# DATA_DIR points at a persistent volume in production (e.g. Railway's
# mount at /data) so lcw.db survives redeploys; defaults to server/ for
# local dev, matching the previous fixed path.
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "lcw.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA_PATH.read_text())


def now_iso():
    # Explicit UTC ISO-8601 (not SQLite's bare CURRENT_TIMESTAMP) so
    # `new Date(r.created_at)` parses the same way in every browser.
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def hash_voter(ip: str, salt: str) -> str:
    """One-way, per-deployment-salted digest of an IP - the raw IP is
    never stored, only this hash, so it can be used as a dedup/rate-limit
    key without keeping PII around.
    """
    return hashlib.sha256(f"{ip}:{salt}".encode()).hexdigest()


def check_rate_limit(conn, voter_hash: str, max_per_hour: int) -> bool:
    """Records this submission attempt for voter_hash if it's under
    max_per_hour in the trailing hour. Returns False (and records nothing)
    once the limit is hit. Port of check_report_rate_limit().
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    count = conn.execute(
        "select count(*) from report_rate_limits where voter_hash = ? and created_at > ?",
        (voter_hash, cutoff)
    ).fetchone()[0]
    if count >= max_per_hour:
        return False
    conn.execute(
        "insert into report_rate_limits (voter_hash, created_at) values (?, ?)",
        (voter_hash, now_iso())
    )
    return True


def confirm_report(conn, report_id: str, voter_hash: str):
    """Records a dedup row for (report_id, voter_hash) and recomputes
    reports.confirmations from the row count, so it can never drift.
    Returns the new total, or None if report_id doesn't exist.
    Port of increment_confirmations().
    """
    conn.execute(
        "insert or ignore into confirmations (report_id, voter_hash, created_at) values (?, ?, ?)",
        (report_id, voter_hash, now_iso())
    )
    conn.execute(
        """update reports
              set confirmations = (select count(*) from confirmations where report_id = ?)
            where id = ?""",
        (report_id, report_id)
    )
    row = conn.execute("select confirmations from reports where id = ?", (report_id,)).fetchone()
    return row["confirmations"] if row else None


def create_admin_user(email: str, password: str, nickname: str | None = None):
    with get_db() as conn:
        conn.execute(
            "insert into users (id, email, password_hash, nickname, is_admin, created_at) "
            "values (?, ?, ?, ?, 1, ?)",
            (new_id(), email, generate_password_hash(password), nickname, now_iso())
        )
