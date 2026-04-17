// src/components/IC3Chart/IC3Chart.jsx
// IC3 Chart component — KLineChart Pro wrapper with /api/ohlc datafeed
// Supports two modes:
//   Trade mode: trade prop → continuous chart, zooms to entry time, shows arrow markers
//   Free mode:  symbol prop → continuous chart for general browsing

import React, { useRef, useEffect, useState } from 'react'
import { KLineChartPro } from '@klinecharts/pro'
import '@klinecharts/pro/dist/klinecharts-pro.css'
import { IC3Datafeed } from './datafeed'
import { createOverlaySaver, restoreOverlays } from './overlayManager'
import './IC3Chart.css'

const API_BASE = 'http://localhost:3001'

// Micro → full-size root mapping (micros share the same parquet data)
const ROOT_MAP = { MES: 'ES', MNQ: 'NQ', MYM: 'YM', M2K: 'RTY' }
function toRoot(instrument) {
  const up = (instrument || '').toUpperCase()
  return ROOT_MAP[up] || up.slice(0, 2) || 'ES'
}

// Available timeframes
const PERIODS = [
  { multiplier: 1,  timespan: 'minute', text: '1m' },
  { multiplier: 5,  timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 30, timespan: 'minute', text: '30m' },
  { multiplier: 1,  timespan: 'hour',   text: '1H' },
  { multiplier: 4,  timespan: 'hour',   text: '4H' },
  { multiplier: 1,  timespan: 'day',    text: '1D' },
]

const DEFAULT_PERIOD = PERIODS[1] // 5m

// TF text → minutes for zoom calculations
const TF_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1H': 60, '4H': 240, '1D': 1440 }

/**
 * Estimate the trade entry timestamp from the trade's date + session.
 * Returns Unix milliseconds for KLC.
 * If we can't determine the exact time, default to NY AM open (9:30 ET).
 */
function estimateTradeTimestamp(trade) {
  if (!trade?.date) return null

  // Session → approximate ET hour:minute
  const sessionTimes = {
    'London':    { h: 3,  m: 0  },
    'NY AM':     { h: 9,  m: 30 },
    'NY PM':     { h: 12, m: 0  },
    'Asia':      { h: 19, m: 0  },  // previous day evening ET
    'Overnight': { h: 22, m: 0  },  // previous day evening ET
  }

  const st = sessionTimes[trade.session] || { h: 9, m: 30 }

  // Build an ET datetime string and convert to UTC ms
  // trade.date is YYYY-MM-DD
  const dateStr = `${trade.date}T${String(st.h).padStart(2, '0')}:${String(st.m).padStart(2, '0')}:00`

  // Use Intl to figure out the ET offset for this date
  const utcDate = new Date(dateStr + 'Z')
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  // Find the UTC offset for ET on this date
  const etParts = etFormatter.formatToParts(utcDate)
  // We want to create a date that IS the ET time, then convert to UTC
  // Simpler: just use a known offset approach
  // EDT = UTC-4, EST = UTC-5
  // Approximate: Mar-Nov = EDT, Nov-Mar = EST
  const month = parseInt(trade.date.slice(5, 7), 10)
  const offsetHours = (month >= 3 && month <= 10) ? 4 : 5

  const ms = new Date(`${trade.date}T${String(st.h).padStart(2, '0')}:${String(st.m).padStart(2, '0')}:00Z`).getTime()
  return ms + offsetHours * 3600_000 // shift from ET to UTC
}

/**
 * Add trade markers to the chart: horizontal price lines + time-precise annotations.
 * Entry gets a solid arrow, exit gets a dashed arrow.
 */
function addTradeMarkers(chartApi, trade, bars) {
  if (!trade?.entry_price || !chartApi) return

  const isLong = trade.direction === 'Long'
  const entryColor = isLong ? '#22c55e' : '#ef4444'
  const exitColor = '#f59e0b'

  // Entry horizontal price line
  chartApi.createOverlay({
    name: 'horizontalStraightLine',
    lock: true,
    visible: true,
    points: [{ value: trade.entry_price }],
    styles: {
      line: { color: entryColor, size: 1, style: 'solid' },
    },
  })

  // Exit horizontal price line
  if (trade.exit_price) {
    chartApi.createOverlay({
      name: 'horizontalStraightLine',
      lock: true,
      visible: true,
      points: [{ value: trade.exit_price }],
      styles: {
        line: { color: exitColor, size: 1, style: 'dashed' },
      },
    })
  }

  // Find the closest bar to the trade's estimated entry time
  const entryTs = estimateTradeTimestamp(trade)
  if (!entryTs || !bars?.length) return

  // Find closest bar by timestamp
  const findClosestBar = (targetTs, price) => {
    let best = null
    let bestDist = Infinity
    for (const bar of bars) {
      // Also try to match by price proximity if the bar contains the price
      const dist = Math.abs(bar.timestamp - targetTs)
      if (dist < bestDist) {
        bestDist = dist
        best = bar
      }
    }
    // Refine: within nearby bars, find one whose high/low brackets the price
    if (price && best) {
      const window = bars.filter(b => Math.abs(b.timestamp - targetTs) < 3600_000) // 1hr window
      const priceMatch = window.find(b => b.low <= price && b.high >= price)
      if (priceMatch) return priceMatch
    }
    return best
  }

  const entryBar = findClosestBar(entryTs, trade.entry_price)

  // Entry arrow annotation — simpleAnnotation overlay at the entry bar
  if (entryBar) {
    chartApi.createOverlay({
      name: 'simpleAnnotation',
      lock: true,
      visible: true,
      points: [{ timestamp: entryBar.timestamp, value: trade.entry_price }],
      styles: {
        symbol: {
          type: isLong ? 'triangle' : 'triangle',
          color: entryColor,
          size: 10,
          activeColor: entryColor,
          activeSize: 12,
        },
        text: { color: '#ffffff', size: 11, family: 'IBM Plex Mono' },
      },
      extendData: `Entry ${trade.entry_price}`,
    })
  }

  // Exit arrow annotation
  if (trade.exit_price) {
    // Estimate exit time: for simplicity, search bars that contain exit price after entry
    const exitBars = entryBar
      ? bars.filter(b => b.timestamp >= entryBar.timestamp && b.low <= trade.exit_price && b.high >= trade.exit_price)
      : []
    const exitBar = exitBars.length > 0 ? exitBars[exitBars.length - 1] : null

    if (exitBar) {
      chartApi.createOverlay({
        name: 'simpleAnnotation',
        lock: true,
        visible: true,
        points: [{ timestamp: exitBar.timestamp, value: trade.exit_price }],
        styles: {
          symbol: {
            type: 'diamond',
            color: exitColor,
            size: 10,
            activeColor: exitColor,
            activeSize: 12,
          },
          text: { color: '#ffffff', size: 11, family: 'IBM Plex Mono' },
        },
        extendData: `Exit ${trade.exit_price}`,
      })
    }
  }
}

/**
 * Scroll chart to center on the trade entry time.
 */
function scrollToTrade(chartApi, trade, bars) {
  if (!trade?.date || !chartApi || !bars?.length) return

  const entryTs = estimateTradeTimestamp(trade)
  if (!entryTs) return

  // Find the bar index closest to entry time
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < bars.length; i++) {
    const dist = Math.abs(bars[i].timestamp - entryTs)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  // scrollToDataIndex is available on KLC v9 Chart instance
  try {
    const totalBars = bars.length
    // Scroll so the entry bar is roughly centered
    const visibleCount = chartApi.getVisibleRange?.()?.to - chartApi.getVisibleRange?.()?.from || 80
    const targetFrom = Math.max(0, bestIdx - Math.floor(visibleCount / 2))
    chartApi.scrollToDataIndex?.(targetFrom)
  } catch (e) {
    console.warn('[IC3Chart] scrollToDataIndex not available:', e)
  }
}

export default function IC3Chart({ trade, symbol, onClose }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [activePeriod, setActivePeriod] = useState(DEFAULT_PERIOD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // For trade mode, use the instrument root (ES, NQ) for continuous chart
  // For free mode, use the symbol prop directly
  const root = trade?.instrument ? toRoot(trade.instrument) : (symbol || 'ES')
  const ticker = root // Always use continuous mode now
  // Show "ES · ESM26" when raw_contract is available, per CLAUDE.md spec
  const rawContract = trade?.raw_contract || null
  const displayName = trade
    ? rawContract
      ? `${root} · ${rawContract}`
      : `${root} · ${trade.date}`
    : `${root} Continuous`
  const isTradeMode = !!trade

  useEffect(() => {
    let mounted = true
    if (!containerRef.current) return

    // Clean up previous chart
    if (chartRef.current) {
      try { chartRef.current.setSymbol?.({ ticker: '' }) } catch {}
      chartRef.current = null
    }

    setLoading(true)
    setError(null)

    const datafeed = new IC3Datafeed()
    let overlaySaver = null

    // Wrap datafeed to detect when data arrives, add markers, zoom, restore overlays
    const wrappedFeed = {
      searchSymbols: (s) => datafeed.searchSymbols(s),
      subscribe: (s, p, cb) => datafeed.subscribe(s, p, cb),
      unsubscribe: (s, p) => datafeed.unsubscribe(s, p),
      getHistoryKLineData: async (sym, period, f, t) => {
        const bars = await datafeed.getHistoryKLineData(sym, period, f, t)
        if (mounted) {
          if (bars.length === 0) {
            setError(`No data available for ${ticker}. Check that the Parquet files exist and re-run the data pull.`)
          }
          setLoading(false)

          // After data loads, set up trade mode features
          if (bars.length > 0 && isTradeMode && chartRef.current) {
            const chartApi = chartRef.current._chartApi
            if (chartApi) {
              // Add entry/exit markers with time-precise annotations
              addTradeMarkers(chartApi, trade, bars)

              // Scroll to the trade entry time
              setTimeout(() => scrollToTrade(chartApi, trade, bars), 100)

              // Restore saved drawings
              restoreOverlays(chartApi, trade.annotations)

              // Wire auto-save — use mouseup/keyup on container as proxy
              // since KLC v9 has no onOverlayChange action type
              overlaySaver = createOverlaySaver(chartApi, trade.id)
              const container = containerRef.current
              if (container && overlaySaver) {
                container.addEventListener('mouseup', overlaySaver)
                container.addEventListener('keyup', overlaySaver)
              }
            }
          }
        }
        return bars
      }
    }

    try {
      const chart = new KLineChartPro({
        container: containerRef.current,
        symbol: {
          ticker: ticker,
          name: displayName,
          shortName: ticker,
          exchange: 'CME',
          market: 'futures',
          pricePrecision: 2,
          volumePrecision: 0,
        },
        period: activePeriod,
        datafeed: wrappedFeed,
        periods: PERIODS,
        theme: 'dark',
        locale: 'en-US',
        timezone: 'America/New_York',
        drawingBarVisible: true,
        mainIndicators: ['MA'],
        subIndicators: ['VOL'],
        styles: {
          candle: {
            bar: {
              upColor: '#26a69a',
              downColor: '#ef5350',
              noChangeColor: '#888888',
              upBorderColor: '#26a69a',
              downBorderColor: '#ef5350',
              noChangeBorderColor: '#888888',
              upWickColor: '#26a69a',
              downWickColor: '#ef5350',
              noChangeWickColor: '#888888',
            },
          },
          grid: {
            horizontal: { color: 'rgba(255,255,255,0.04)' },
            vertical:   { color: 'rgba(255,255,255,0.04)' },
          },
          crosshair: {
            horizontal: { line: { color: 'rgba(255,255,255,0.2)' } },
            vertical:   { line: { color: 'rgba(255,255,255,0.2)' } },
          },
        },
      })

      // Apply full TradingView-exact style palette AFTER init so it overrides
      // KLC Pro's internal dark theme defaults
      try {
        chart.setStyles({
          candle: {
            bar: {
              upColor:             '#26a69a',
              downColor:           '#ef5350',
              noChangeColor:       '#888888',
              upBorderColor:       '#26a69a',
              downBorderColor:     '#ef5350',
              noChangeBorderColor: '#888888',
              upWickColor:         '#26a69a',
              downWickColor:       '#ef5350',
              noChangeWickColor:   '#888888',
            },
            priceMark: {
              last: {
                upColor:      '#26a69a',
                downColor:    '#ef5350',
                noChangeColor: '#888888',
                text: { color: '#d1d4dc', size: 11 },
              },
              high: { color: '#787b86', textColor: '#787b86' },
              low:  { color: '#787b86', textColor: '#787b86' },
            },
          },
          grid: {
            horizontal: { color: 'rgba(255,255,255,0.04)', style: 'solid', show: true },
            vertical:   { show: false },
          },
          xAxis: {
            axisLine:  { show: true, color: '#2a2e39' },
            tickLine:  { show: true, color: '#2a2e39' },
            tickText:  { color: '#787b86', size: 11 },
          },
          yAxis: {
            axisLine:  { show: true, color: '#2a2e39' },
            tickLine:  { show: true, color: '#2a2e39' },
            tickText:  { color: '#787b86', size: 11 },
          },
          crosshair: {
            horizontal: {
              line: { color: 'rgba(120,123,134,0.3)', style: 'dashed' },
              text: { backgroundColor: '#363a45', color: '#d1d4dc', size: 11, borderRadius: 2 },
            },
            vertical: {
              line: { color: 'rgba(120,123,134,0.3)', style: 'dashed' },
              text: { backgroundColor: '#363a45', color: '#d1d4dc', size: 11, borderRadius: 2 },
            },
          },
        })
      } catch (styleErr) {
        console.warn('[IC3Chart] setStyles failed:', styleErr)
      }

      chartRef.current = chart
    } catch (err) {
      console.error('[IC3Chart] Init error:', err)
      if (mounted) {
        setError(`Chart initialization failed: ${err.message}`)
        setLoading(false)
      }
    }

    return () => {
      mounted = false
      if (chartRef.current?._chartApi && overlaySaver) {
        overlaySaver()
      }
      if (containerRef.current && overlaySaver) {
        containerRef.current.removeEventListener('mouseup', overlaySaver)
        containerRef.current.removeEventListener('keyup', overlaySaver)
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
      chartRef.current = null
    }
  }, [ticker, activePeriod])

  return (
    <div className="ic3-chart-wrapper">
      <div className="ic3-chart-header">
        <div className="ic3-chart-header-left">
          {onClose && (
            <button className="ic3-chart-back-btn" onClick={onClose} title="Back to trades">
              &larr;
            </button>
          )}
          <div className="ic3-chart-symbol">{displayName}</div>
          {isTradeMode && trade.direction && (
            <span className={`ic3-chart-direction ${trade.direction === 'Long' ? 'long' : 'short'}`}>
              {trade.direction}
            </span>
          )}
          {isTradeMode && trade.entry_price && (
            <span className="ic3-chart-entry-label">
              Entry: {trade.entry_price}
              {trade.exit_price ? ` → Exit: ${trade.exit_price}` : ''}
            </span>
          )}
        </div>
        <div className="ic3-chart-tf-bar">
          {PERIODS.map(p => (
            <button
              key={p.text}
              className={`ic3-tf-btn ${activePeriod.text === p.text ? 'active' : ''}`}
              onClick={() => setActivePeriod(p)}
            >
              {p.text}
            </button>
          ))}
        </div>
      </div>
      <div className="ic3-chart-container-outer">
        {loading && (
          <div className="ic3-chart-overlay">
            <div className="ic3-chart-overlay-text">Loading {ticker} continuous...</div>
          </div>
        )}
        {error && !loading && (
          <div className="ic3-chart-overlay ic3-chart-error">
            <div className="ic3-chart-overlay-text">{error}</div>
          </div>
        )}
        <div ref={containerRef} className="ic3-chart-container" />
      </div>
    </div>
  )
}
