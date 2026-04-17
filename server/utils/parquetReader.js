// server/utils/parquetReader.js
// ── Parquet reader + timeframe aggregator for IC3 ────────────────────────────
//
// Uses DuckDB to read pyarrow-generated Parquet files (supports v2.6).
// Bar format: { time: UnixSeconds, time_et: ISOString, session_date: string,
//               open, high, low, close, volume }

const duckdb = require('duckdb');
const { DateTime } = require('luxon');

const EASTERN_TZ = 'America/New_York';

// Shared in-memory DuckDB instance for fast Parquet reads
const db = new duckdb.Database(':memory:');

/**
 * Convert a UTC Unix seconds timestamp to Eastern Time ISO string.
 * @param {number} unixSec - UTC seconds
 * @returns {string} e.g. "2023-06-14T09:31:00-04:00"
 */
function toEasternISO(unixSec) {
  return DateTime.fromSeconds(unixSec, { zone: 'utc' })
    .setZone(EASTERN_TZ)
    .toISO();
}

/**
 * Return the CME session date for a UTC Unix seconds timestamp.
 * Bars at or after 18:00 ET belong to the NEXT calendar date's session.
 * @param {number} unixSec
 * @returns {string} e.g. "2023-06-15"
 */
function sessionDate(unixSec) {
  const et = DateTime.fromSeconds(unixSec, { zone: 'utc' }).setZone(EASTERN_TZ);
  if (et.hour >= 18) {
    return et.plus({ days: 1 }).toISODate();
  }
  return et.toISODate();
}

/**
 * Read all bars from a Parquet file using DuckDB.
 * Returns array of { time, time_et, session_date, open, high, low, close, volume }
 */
function readParquet(filePath) {
  // Normalize Windows backslashes to forward slashes for DuckDB
  const safePath = filePath.replace(/\\/g, '/');

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT epoch(timestamp) AS time_sec, open, high, low, close, volume, session_date
       FROM read_parquet('${safePath}')
       ORDER BY timestamp ASC`,
      (err, rows) => {
        if (err) return reject(err);

        const bars = rows.map(row => {
          const timeSec = Number(row.time_sec);
          return {
            time:         timeSec,
            time_et:      toEasternISO(timeSec),
            session_date: row.session_date || sessionDate(timeSec),
            open:         row.open,
            high:         row.high,
            low:          row.low,
            close:        row.close,
            volume:       Number(row.volume),
          };
        });

        resolve(bars);
      }
    );
  });
}

/**
 * Aggregate 1-minute bars into daily bars keyed by CME session date (ET).
 */
function aggregateDailyBySession(bars) {
  const buckets = new Map();

  for (const bar of bars) {
    const sd = bar.session_date;
    if (!buckets.has(sd)) {
      buckets.set(sd, {
        time:         bar.time,
        time_et:      bar.time_et,
        session_date: sd,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume
      });
    } else {
      const b = buckets.get(sd);
      if (bar.high  > b.high)  b.high  = bar.high;
      if (bar.low   < b.low)   b.low   = bar.low;
      b.close  = bar.close;
      b.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Aggregate 1-minute bars into a higher timeframe.
 * @param {Array} bars   - sorted 1-minute bars
 * @param {number} tfMin - target timeframe in minutes
 * @returns {Array}      - aggregated bars
 */
function aggregateBars(bars, tfMin) {
  if (!bars.length) return [];

  if (tfMin === 1440) {
    return aggregateDailyBySession(bars);
  }

  const tfSec    = tfMin * 60;
  const buckets  = new Map();

  for (const bar of bars) {
    const bucketTime = Math.floor(bar.time / tfSec) * tfSec;
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        time:         bucketTime,
        time_et:      toEasternISO(bucketTime),
        session_date: sessionDate(bucketTime),
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume
      });
    } else {
      const b = buckets.get(bucketTime);
      if (bar.high  > b.high)  b.high  = bar.high;
      if (bar.low   < b.low)   b.low   = bar.low;
      b.close  = bar.close;
      b.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Convert ISO date string to Unix seconds.
 */
function toUnixSeconds(isoStr) {
  return Math.floor(new Date(isoStr).getTime() / 1000);
}

module.exports = { readParquet, aggregateBars, toUnixSeconds, toEasternISO, sessionDate };
