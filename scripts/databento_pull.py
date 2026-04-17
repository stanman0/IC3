#!/usr/bin/env python3
"""
IC3 Databento Historical Data Pull
===================================
Downloads 1-minute OHLCV data for every ES and NQ quarterly contract
from Q1 2021 through Q2 2026 and saves as individual Parquet files.

Usage:
    python scripts/databento_pull.py
    python scripts/databento_pull.py --dry-run        # show what would be downloaded
    python scripts/databento_pull.py --symbol ES      # only ES contracts
    python scripts/databento_pull.py --symbol NQ      # only NQ contracts
    python scripts/databento_pull.py --resume         # skip already-downloaded files
"""

import os
import sys
import argparse
import logging
from pathlib import Path
from datetime import date

import databento as db
import pandas as pd
import pytz
from datetime import datetime
from tqdm import tqdm

# Try loading .env file for API key
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# ── Configuration ──────────────────────────────────────────────────────────────

DATASET    = "GLBX.MDP3"
SCHEMA     = "ohlcv-1m"
STYPE_IN   = "raw_symbol"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "parquet"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("databento_pull")

# ── Contract Master Table ───────────────────────────────────────────────────────
# Each entry: (es_symbol, nq_symbol, pull_start, pull_end, expiration, roll_date, active_from, active_to)

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

# Eastern timezone for session date computation
EASTERN = pytz.timezone("America/New_York")


def compute_session_date(utc_ts):
    """
    Given a UTC-aware timestamp, return the CME session date (ET calendar date
    of the trading day this bar belongs to).
    CME overnight session opens at 18:00 ET. A bar at or after 18:00 ET belongs
    to the NEXT calendar date's session.
    """
    et_ts = utc_ts.astimezone(EASTERN)
    if et_ts.hour >= 18:
        return (et_ts + pd.Timedelta(days=1)).date().isoformat()
    return et_ts.date().isoformat()


def to_databento_symbol(ic3_symbol: str) -> str:
    """
    Convert IC3's 2-digit year symbol (e.g., ESH25) to Databento's
    single-digit year format (e.g., ESH5).
    Databento GLBX.MDP3 uses CME Globex native symbology: root + month + last digit of year.
    The date range in the API call disambiguates decades.
    """
    # IC3 format: ESH25 -> root=ES, month=H, year=25
    # Databento format: ESH5
    root = ic3_symbol[:2]    # ES or NQ
    month = ic3_symbol[2]    # H, M, U, or Z
    year_digit = ic3_symbol[-1]  # last digit of year
    return f"{root}{month}{year_digit}"


def build_job_list(symbol_filter: str | None) -> list[dict]:
    """
    Expand the CONTRACTS table into individual download jobs.
    Each job targets one raw symbol for one date range.
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    jobs = []
    for row in CONTRACTS:
        es_sym, nq_sym, pull_start, pull_end, expiration, roll_date, active_from, active_to = row
        for sym, root in [(es_sym, "ES"), (nq_sym, "NQ")]:
            if symbol_filter and root != symbol_filter:
                continue
            # Cap pull_end to today if the contract hasn't expired yet
            effective_pull_end = min(pull_end, today_str)
            if effective_pull_end <= pull_start:
                continue  # Contract entirely in the future, skip
            jobs.append({
                "symbol":      sym,
                "db_symbol":   to_databento_symbol(sym),
                "root":        root,
                "pull_start":  pull_start,
                "pull_end":    effective_pull_end,
                "expiration":  expiration,
                "roll_date":   roll_date,
                "active_from": active_from,
                "active_to":   active_to,
                "output_path": OUTPUT_DIR / root / f"{sym}.parquet",
            })
    return jobs


def download_contract(client: db.Historical, job: dict) -> bool:
    """
    Download ohlcv-1m data for a single contract and save as Parquet.
    Returns True on success, False on error.
    """
    out_path: Path = job["output_path"]
    out_path.parent.mkdir(parents=True, exist_ok=True)

    db_sym = job["db_symbol"]
    log.info(f"Downloading {job['symbol']} (as {db_sym})  {job['pull_start']} -> {job['pull_end']}")

    try:
        data = client.timeseries.get_range(
            dataset=DATASET,
            schema=SCHEMA,
            symbols=[db_sym],
            stype_in=STYPE_IN,
            start=job["pull_start"],
            end=job["pull_end"],
        )

        df = data.to_df()

        if df.empty:
            log.warning(f"  {job['symbol']}: Empty response — no bars returned. Skipping.")
            return False

        # Databento returns ts_event as the DatetimeIndex — move it to a column
        if df.index.name == "ts_event":
            df = df.reset_index()
            df = df.rename(columns={"ts_event": "timestamp"})
        elif "ts_event" in df.columns:
            df = df.rename(columns={"ts_event": "timestamp"})

        # Keep only essential columns (prices are already real float64 dollars, no scaling needed)
        keep_cols = ["timestamp", "open", "high", "low", "close", "volume"]
        df = df[[c for c in keep_cols if c in df.columns]].copy()

        # Ensure timestamp is UTC-aware datetime
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

        # Sort ascending
        df = df.sort_values("timestamp").reset_index(drop=True)

        # Add metadata columns for downstream use
        df["symbol"]      = job["symbol"]
        df["root"]        = job["root"]
        df["active_from"] = job["active_from"]
        df["active_to"]   = job["active_to"]
        df["expiration"]  = job["expiration"]
        df["roll_date"]   = job["roll_date"]

        # Add session_date column (ET trading day this bar belongs to)
        df["session_date"] = df["timestamp"].apply(compute_session_date)

        # Save as Parquet (snappy compression)
        df.to_parquet(out_path, engine="pyarrow", compression="snappy", index=False)

        bar_count = len(df)
        size_mb = out_path.stat().st_size / 1_048_576
        log.info(f"  OK  {job['symbol']}: {bar_count:,} bars  ->  {out_path.name} ({size_mb:.1f} MB)")
        return True

    except Exception as e:
        log.error(f"  FAIL  {job['symbol']}: {type(e).__name__}: {e}")
        return False


def run(args):
    api_key = os.environ.get("DATABENTO_API_KEY")
    if not api_key:
        log.error("DATABENTO_API_KEY environment variable not set. Exiting.")
        log.error("Set it in your .env file or: export DATABENTO_API_KEY=your_key_here")
        sys.exit(1)

    jobs = build_job_list(args.symbol)
    log.info(f"Total jobs: {len(jobs)}")

    if args.dry_run:
        print(f"\n{'SYMBOL':<10} {'DB_SYM':<8} {'START':<14} {'END':<14} {'OUTPUT'}")
        print("-" * 90)
        for j in jobs:
            exists = "exists" if j["output_path"].exists() else "missing"
            print(f"{j['symbol']:<10} {j['db_symbol']:<8} {j['pull_start']:<14} {j['pull_end']:<14} {exists:>8}  {j['output_path'].name}")
        print(f"\nTotal: {len(jobs)} files")
        return

    client = db.Historical(api_key)

    results = {"success": 0, "skipped": 0, "failed": 0}

    for job in tqdm(jobs, desc="Downloading contracts", unit="contract"):
        out_path = job["output_path"]

        # Resume mode: skip already-downloaded files
        if args.resume and out_path.exists() and out_path.stat().st_size > 1000:
            log.info(f"  SKIP  {job['symbol']}: already exists (--resume)")
            results["skipped"] += 1
            continue

        success = download_contract(client, job)
        if success:
            results["success"] += 1
        else:
            results["failed"] += 1

    log.info("=" * 60)
    log.info(f"Download complete: {results['success']} success | {results['skipped']} skipped | {results['failed']} failed")
    if results["failed"] > 0:
        log.warning("Some contracts failed. Re-run with --resume to retry only missing files.")


def main():
    parser = argparse.ArgumentParser(description="IC3 Databento historical data downloader")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be downloaded without making API calls")
    parser.add_argument("--resume",  action="store_true", help="Skip files that already exist on disk")
    parser.add_argument("--symbol",  choices=["ES", "NQ"], default=None, help="Download only ES or only NQ")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
