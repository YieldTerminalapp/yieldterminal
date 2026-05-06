"""SQLite store — events + indexer cursor."""
import sqlite3
from contextlib import contextmanager
from typing import Iterator

try:
    from .config import DB_PATH
except ImportError:
    from config import DB_PATH  # type: ignore[no-redef]

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    signature TEXT,
    vault TEXT,
    wallet TEXT,
    amount INTEGER,
    shares INTEGER,
    delta_bps INTEGER,
    ts INTEGER NOT NULL,
    slot INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_vault ON events(vault, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_ts    ON events(ts DESC);

CREATE TABLE IF NOT EXISTS snapshots (
    vault TEXT NOT NULL,
    ts INTEGER NOT NULL,
    total_deposits INTEGER NOT NULL,
    performance_bps INTEGER NOT NULL,
    PRIMARY KEY (vault, ts)
);
CREATE INDEX IF NOT EXISTS idx_snap_vault_ts ON snapshots(vault, ts);

CREATE TABLE IF NOT EXISTS cursor (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
"""


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def set_cursor(key: str, value: str) -> None:
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO cursor(k,v) VALUES (?,?)", (key, value))


def get_cursor(key: str) -> str | None:
    with conn() as c:
        row = c.execute("SELECT v FROM cursor WHERE k=?", (key,)).fetchone()
        return row["v"] if row else None


def insert_event(kind: str, *, signature=None, vault=None, wallet=None,
                 amount=None, shares=None, delta_bps=None, ts: int, slot=None) -> None:
    with conn() as c:
        c.execute(
            "INSERT INTO events(kind,signature,vault,wallet,amount,shares,delta_bps,ts,slot)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (kind, signature, vault, wallet, amount, shares, delta_bps, ts, slot),
        )


def recent_events(vault: str | None = None, limit: int = 50) -> list[dict]:
    with conn() as c:
        if vault:
            rows = c.execute(
                "SELECT * FROM events WHERE vault=? ORDER BY ts DESC LIMIT ?",
                (vault, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM events ORDER BY ts DESC LIMIT ?", (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


def snapshot_vault(vault: str, total_deposits: int, performance_bps: int, ts: int) -> None:
    with conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO snapshots(vault,ts,total_deposits,performance_bps) VALUES (?,?,?,?)",
            (vault, ts, total_deposits, performance_bps),
        )


def vault_history(vault: str, limit: int = 200) -> list[dict]:
    with conn() as c:
        rows = c.execute(
            "SELECT ts,total_deposits,performance_bps FROM snapshots WHERE vault=? ORDER BY ts ASC LIMIT ?",
            (vault, limit),
        ).fetchall()
        return [dict(r) for r in rows]
