#!/usr/bin/env python3
"""
IC3 Roll Calendar Seeder
=========================
Populates the contract_calendar table in ic3.db from the hardcoded
contract master table. Run once after databento_pull.py completes.

Usage:
    python scripts/seed_roll_calendar.py
    python scripts/seed_roll_calendar.py --db path/to/ic3.db
"""

import argparse
import sqlite3
import logging
from pathlib import Path

log = logging.getLogger("seed_roll_calendar")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")

DEFAULT_DB = Path(__file__).parent.parent / "data" / "ic3.db"

# Mirror of CONTRACTS from databento_pull.py — single source of truth
CONTRACTS = [
    ("ESH21", "NQH21", "2020-12-12", "2021-03-19", "2021-03-19", "2021-03-15", "2020-12-15", "2021-03-15"),
    ("ESM21", "NQM21", "2021-03-13", "2021-06-18", "2021-06-18", "2021-06-14", "2021-03-16", "2021-06-14"),
    ("ESU21", "NQU21", "2021-06-12", "2021-09-17", "2021-09-17", "2021-09-13", "2021-06-15", "2021-09-13"),
    ("ESZ21", "NQZ21", "2021-09-11", "2021-12-17", "2021-12-17", "2021-12-13", "2021-09-14", "2021-12-13"),
    ("ESH22", "NQH22", "2021-12-11", "2022-03-18", "2022-03-18", "2022-03-14", "2021-12-14", "2022-03-14"),
    ("ESM22", "NQM22", "2022-03-12", "2022-06-17", "2022-06-17", "2022-06-13", "2022-03-15", "2022-06-13"),
    ("ESU22", "NQU22", "2022-06-11", "2022-09-16", "2022-09-16", "2022-09-12", "2022-06-14", "2022-09-12"),
    ("ESZ22", "NQZ22", "2022-09-10", "2022-12-16", "2022-12-16", "2022-12-12", "2022-09-13", "2022-12-12"),
    ("ESH23", "NQH23", "2022-12-10", "2023-03-17", "2023-03-17", "2023-03-13", "2022-12-13", "2023-03-13"),
    ("ESM23", "NQM23", "2023-03-11", "2023-06-16", "2023-06-16", "2023-06-12", "2023-03-14", "2023-06-12"),
    ("ESU23", "NQU23", "2023-06-10", "2023-09-15", "2023-09-15", "2023-09-11", "2023-06-13", "2023-09-11"),
    ("ESZ23", "NQZ23", "2023-09-09", "2023-12-15", "2023-12-15", "2023-12-11", "2023-09-12", "2023-12-11"),
    ("ESH24", "NQH24", "2023-12-09", "2024-03-15", "2024-03-15", "2024-03-11", "2023-12-12", "2024-03-11"),
    ("ESM24", "NQM24", "2024-03-09", "2024-06-21", "2024-06-21", "2024-06-17", "2024-03-12", "2024-06-17"),
    ("ESU24", "NQU24", "2024-06-15", "2024-09-20", "2024-09-20", "2024-09-16", "2024-06-18", "2024-09-16"),
    ("ESZ24", "NQZ24", "2024-09-14", "2024-12-20", "2024-12-20", "2024-12-16", "2024-09-17", "2024-12-16"),
    ("ESH25", "NQH25", "2024-12-14", "2025-03-21", "2025-03-21", "2025-03-17", "2024-12-17", "2025-03-17"),
    ("ESM25", "NQM25", "2025-03-15", "2025-06-20", "2025-06-20", "2025-06-16", "2025-03-18", "2025-06-16"),
    ("ESU25", "NQU25", "2025-06-14", "2025-09-19", "2025-09-19", "2025-09-15", "2025-06-17", "2025-09-15"),
    ("ESZ25", "NQZ25", "2025-09-13", "2025-12-19", "2025-12-19", "2025-12-15", "2025-09-16", "2025-12-15"),
    ("ESH26", "NQH26", "2025-12-13", "2026-03-20", "2026-03-20", "2026-03-16", "2025-12-16", "2026-03-16"),
    ("ESM26", "NQM26", "2026-03-14", "2026-06-19", "2026-06-19", "2026-06-15", "2026-03-17", "2026-06-15"),
]

PARQUET_BASE = Path(__file__).parent.parent / "data" / "parquet"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS contract_calendar (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    root         TEXT    NOT NULL,
    raw_symbol   TEXT    NOT NULL UNIQUE,
    active_from  TEXT    NOT NULL,
    active_to    TEXT    NOT NULL,
    expiration   TEXT    NOT NULL,
    roll_date    TEXT    NOT NULL,
    pull_start   TEXT    NOT NULL,
    pull_end     TEXT    NOT NULL,
    parquet_path TEXT,
    bar_count    INTEGER DEFAULT 0
);
"""

INSERT_ROW = """
INSERT OR REPLACE INTO contract_calendar
    (root, raw_symbol, active_from, active_to, expiration, roll_date, pull_start, pull_end, parquet_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def seed(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute(CREATE_TABLE)

    rows_inserted = 0
    for row in CONTRACTS:
        es_sym, nq_sym, pull_start, pull_end, expiration, roll_date, active_from, active_to = row
        for sym, root in [(es_sym, "ES"), (nq_sym, "NQ")]:
            parquet_path = str(PARQUET_BASE / root / f"{sym}.parquet")
            cur.execute(INSERT_ROW, (root, sym, active_from, active_to, expiration, roll_date, pull_start, pull_end, parquet_path))
            rows_inserted += 1

    conn.commit()
    conn.close()
    log.info(f"Seeded {rows_inserted} rows into contract_calendar -> {db_path}")


def main():
    parser = argparse.ArgumentParser(description="IC3 Roll Calendar Seeder")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to ic3.db SQLite file")
    args = parser.parse_args()
    seed(Path(args.db))


if __name__ == "__main__":
    main()
