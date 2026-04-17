#!/usr/bin/env python3
"""
IC3 Parquet Validation
=======================
Checks each expected Parquet file for:
  - File exists and is non-empty
  - Required columns are present
  - Row count is within expected range for a 3-month futures contract
  - No duplicate timestamps
  - Timestamps are monotonically increasing
  - Prices are in a sane range for ES/NQ
  - session_date column is populated
  - Timestamps are UTC-aware

Usage:
    python scripts/validate_parquet.py
    python scripts/validate_parquet.py --verbose
"""

import argparse
import logging
from pathlib import Path

import pandas as pd

log = logging.getLogger("validate_parquet")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")

PARQUET_BASE = Path(__file__).parent.parent / "data" / "parquet"

# Expected minimum bars for a ~3 month contract at 1-minute resolution
# 23h/day x 60min x ~63 trading days = ~87,000 bars. Use 50k as floor.
MIN_BARS_EXPECTED = 50_000

# Sanity check price ranges per root symbol
PRICE_RANGES = {
    "ES":  (500,   8000),
    "NQ":  (3000,  30000),
}

# All expected files (from the CONTRACTS table)
EXPECTED_FILES = [
    ("ES", sym) for sym in ["ESH21","ESM21","ESU21","ESZ21","ESH22","ESM22","ESU22","ESZ22",
                             "ESH23","ESM23","ESU23","ESZ23","ESH24","ESM24","ESU24","ESZ24",
                             "ESH25","ESM25","ESU25","ESZ25","ESH26","ESM26"]
] + [
    ("NQ", sym) for sym in ["NQH21","NQM21","NQU21","NQZ21","NQH22","NQM22","NQU22","NQZ22",
                             "NQH23","NQM23","NQU23","NQZ23","NQH24","NQM24","NQU24","NQZ24",
                             "NQH25","NQM25","NQU25","NQZ25","NQH26","NQM26"]
]


def validate_file(root: str, symbol: str, verbose: bool) -> dict:
    path = PARQUET_BASE / root / f"{symbol}.parquet"
    issues = []

    if not path.exists():
        return {"symbol": symbol, "status": "MISSING", "issues": ["File does not exist"], "bars": 0}

    size_kb = path.stat().st_size / 1024
    if size_kb < 10:
        return {"symbol": symbol, "status": "EMPTY", "issues": [f"File too small: {size_kb:.1f} KB"], "bars": 0}

    try:
        df = pd.read_parquet(path)
    except Exception as e:
        return {"symbol": symbol, "status": "CORRUPT", "issues": [f"Cannot read: {e}"], "bars": 0}

    # Column check
    required = {"timestamp", "open", "high", "low", "close", "volume"}
    missing_cols = required - set(df.columns)
    if missing_cols:
        issues.append(f"Missing columns: {missing_cols}")

    bars = len(df)
    if bars < MIN_BARS_EXPECTED:
        issues.append(f"Low bar count: {bars:,} (expected >= {MIN_BARS_EXPECTED:,})")

    # Duplicate timestamp check
    if "timestamp" in df.columns:
        dupes = df["timestamp"].duplicated().sum()
        if dupes > 0:
            issues.append(f"{dupes:,} duplicate timestamps")

        # Monotonic check
        if not df["timestamp"].is_monotonic_increasing:
            issues.append("Timestamps not monotonically increasing")

        # UTC-aware check
        ts_dtype = str(df["timestamp"].dtype)
        if "UTC" not in ts_dtype and "utc" not in ts_dtype:
            issues.append(f"Timestamps not UTC-aware: dtype={ts_dtype}")

    # session_date column check
    if "session_date" not in df.columns:
        issues.append("Missing session_date column")
    elif df["session_date"].isna().any():
        issues.append("session_date has null values")

    # Price sanity check
    lo, hi = PRICE_RANGES.get(root, (0, 999999))
    if "close" in df.columns:
        price_min = df["close"].min()
        price_max = df["close"].max()
        if price_min < lo or price_max > hi:
            issues.append(f"Price out of range: min={price_min}, max={price_max} (expected {lo}-{hi})")

    status = "OK" if not issues else "WARN"
    if verbose or status != "OK":
        marker = "OK" if status == "OK" else "WARN"
        log.info(f"  {marker}  {symbol:<8} {bars:>8,} bars  {size_kb:>7.0f} KB  {'; '.join(issues) if issues else ''}")

    return {"symbol": symbol, "status": status, "issues": issues, "bars": bars}


def main():
    parser = argparse.ArgumentParser(description="IC3 Parquet Validation")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    results = [validate_file(root, sym, args.verbose) for root, sym in EXPECTED_FILES]

    ok      = [r for r in results if r["status"] == "OK"]
    warn    = [r for r in results if r["status"] == "WARN"]
    missing = [r for r in results if r["status"] in ("MISSING", "EMPTY", "CORRUPT")]

    print(f"\n{'='*60}")
    print(f"Validation Summary: {len(ok)} OK  |  {len(warn)} WARN  |  {len(missing)} MISSING/ERROR")
    print(f"Total expected files: {len(EXPECTED_FILES)}")
    if missing:
        print(f"\nMissing or corrupt files:")
        for r in missing:
            print(f"  {r['symbol']:<10} {r['status']}  --  {'; '.join(r['issues'])}")
    if warn:
        print(f"\nFiles with warnings:")
        for r in warn:
            print(f"  {r['symbol']:<10}  {'; '.join(r['issues'])}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
