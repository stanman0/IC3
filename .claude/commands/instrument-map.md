# Instrument Mapping Skill

When a user trades micro contracts (MES, MNQ, MYM, M2K), IC3 automatically maps them to the full-size contract data:

| Micro | Maps To | Data Source |
|-------|---------|-------------|
| MES   | ES      | data/parquet/ES/ |
| MNQ   | NQ      | data/parquet/NQ/ |
| MYM   | YM      | data/parquet/YM/ (if available) |
| M2K   | RTY     | data/parquet/RTY/ (if available) |

## Where Mapping Occurs

1. **Server** (`server/routes/ohlc.js`): `resolveRoot()` function converts micro roots to full-size before querying the contract calendar and parquet files.

2. **Client** (`src/components/IC3Chart/IC3Chart.jsx`): `toRoot()` function maps the trade's instrument to the chart root symbol. `ROOT_MAP = { MES: 'ES', MNQ: 'NQ', MYM: 'YM', M2K: 'RTY' }`.

3. **Datafeed** (`src/components/IC3Chart/datafeed.js`): `CONTINUOUS_ROOTS` array includes both full-size and micro symbols so they all route to continuous mode.

## Adding New Instruments

To add a new instrument mapping:
1. Add to `ROOT_MAP` in `server/routes/ohlc.js`
2. Add to `ROOT_MAP` in `src/components/IC3Chart/IC3Chart.jsx`
3. Add to `CONTINUOUS_ROOTS` in `src/components/IC3Chart/datafeed.js`
4. Add point values to `POINT_VALUES` in `src/tabs/HistoryTab.jsx`
5. Pull the parquet data using `scripts/databento_pull.py`
6. Seed the roll calendar using `scripts/seed_roll_calendar.py`
