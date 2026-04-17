// src/components/IC3Chart/datafeed.js
// IC3 Datafeed adapter for KLineChart Pro
// Bridges /api/ohlc endpoint to KLineChart Pro's Datafeed interface

const API_BASE = 'http://localhost:3001'

// Root symbols that should use continuous mode (no specific contract)
const CONTINUOUS_ROOTS = ['ES', 'NQ', 'YM', 'RTY', 'MES', 'MNQ', 'MYM', 'M2K']

// Map KLC period object -> our API timeframe string
function periodToTf(period) {
  const { multiplier, timespan } = period
  const map = {
    minute: { 1: '1m', 5: '5m', 15: '15m', 30: '30m' },
    hour:   { 1: '1h', 4: '4h' },
    day:    { 1: '1d' },
  }
  return map[timespan]?.[multiplier] ?? '5m'
}

export class IC3Datafeed {
  constructor() {
    this._symbols = []
  }

  // Return list of available symbols for the search box
  async searchSymbols(search) {
    const all = [
      { ticker: 'ES', name: 'E-mini S&P 500 (Continuous)',  shortName: 'ES',  exchange: 'CME', market: 'futures', pricePrecision: 2, volumePrecision: 0 },
      { ticker: 'NQ', name: 'E-mini Nasdaq 100 (Continuous)', shortName: 'NQ', exchange: 'CME', market: 'futures', pricePrecision: 2, volumePrecision: 0 },
    ]
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
  }

  async _fetchBars(ticker, tf, fromSec, toSec) {
    const isContinuous = CONTINUOUS_ROOTS.includes(ticker.toUpperCase())
    const url = isContinuous
      ? `${API_BASE}/api/ohlc?root=${ticker}&tf=${tf}&from=${fromSec}&to=${toSec}`
      : `${API_BASE}/api/ohlc?symbol=${ticker}&tf=${tf}&from=${fromSec}&to=${toSec}`
    const res = await fetch(url)
    const data = await res.json()
    return Array.isArray(data.bars) ? data.bars : []
  }

  async _fetchLatestSec(ticker) {
    try {
      const res = await fetch(`${API_BASE}/api/ohlc/latest?root=${ticker}`)
      if (!res.ok) return null
      const data = await res.json()
      return typeof data.latest_sec === 'number' ? data.latest_sec : null
    } catch {
      return null
    }
  }

  // Fetch historical OHLCV bars from /api/ohlc
  async getHistoryKLineData(symbol, period, from, to) {
    const tf = periodToTf(period)
    const ticker = symbol.ticker || symbol

    const fromSec = Math.floor(from / 1000)
    let toSec = Math.floor(to / 1000)

    try {
      let bars = await this._fetchBars(ticker, tf, fromSec, toSec)

      // Fallback: if empty and `to` is ahead of the latest available bar,
      // slide the window back to end at the latest bar and retry once.
      if (bars.length === 0 && CONTINUOUS_ROOTS.includes(ticker.toUpperCase())) {
        const latest = await this._fetchLatestSec(ticker)
        if (latest && latest < toSec) {
          const width = Math.max(toSec - fromSec, 86400)
          const newTo = latest
          const newFrom = Math.max(0, latest - width)
          bars = await this._fetchBars(ticker, tf, newFrom, newTo)
        }
      }

      if (bars.length === 0) {
        console.warn('[IC3Datafeed] No bars for', ticker, tf)
        return []
      }

      return bars.map(b => ({
        timestamp: b.time * 1000,
        open:      b.open,
        high:      b.high,
        low:       b.low,
        close:     b.close,
        volume:    b.volume,
      }))
    } catch (err) {
      console.error('[IC3Datafeed] Fetch error:', err)
      return []
    }
  }

  // Real-time subscription — no-op for now (historical data only)
  subscribe(symbol, period, callback) {
    // Future: WebSocket for live data
  }

  unsubscribe(symbol, period) {
    // Future: clean up WebSocket
  }
}
