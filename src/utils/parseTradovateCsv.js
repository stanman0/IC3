// Parses a Tradovate orders CSV export into IC3 trade objects.
// Handles scaling in/out, partial closes, and position flips.

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += line[i]
    }
  }
  result.push(current.trim())
  return result
}

// Convert a local datetime string (MM/DD/YYYY HH:MM:SS) in the given IANA timezone to a UTC Date.
function localTimeToUTC(dateStr, timezone) {
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (!match) return null
  const [, month, day, year, hour, min, sec] = match

  // Treat the input as UTC temporarily to get a reference point
  const guess = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec))

  // Find out what this UTC moment looks like in the source timezone
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })
  const parts = {}
  fmt.formatToParts(guess).forEach(p => { if (p.type !== 'literal') parts[p.type] = parseInt(p.value) })

  // Compute how far off we are
  const tzTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second)
  const offsetMs = guess.getTime() - tzTime

  // Shift by the offset to get the true UTC time
  return new Date(guess.getTime() + offsetMs)
}

// Returns the ET date string (YYYY-MM-DD) and hour (0-23) for a UTC Date.
function toETInfo(utcDate) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  })
  const parts = {}
  fmt.formatToParts(utcDate).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value })
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour) % 24,
  }
}

function getSession(etHour) {
  if (etHour >= 2 && etHour < 5) return 'London'
  if (etHour >= 7 && etHour < 12) return 'NY AM'
  if (etHour >= 12 && etHour < 17) return 'NY PM'
  if (etHour >= 20 || etHour < 2) return 'Asia'
  return 'Overnight'
}

function weightedAvg(fills) {
  const totalQty = fills.reduce((s, f) => s + f.qty, 0)
  if (totalQty === 0) return 0
  const totalValue = fills.reduce((s, f) => s + f.price * f.qty, 0)
  return Math.round((totalValue / totalQty) * 100) / 100
}

function buildTrade(openingFills, closingFills, direction) {
  const entryPrice = weightedAvg(openingFills)
  const exitPrice = weightedAvg(closingFills)
  const contracts = openingFills.reduce((s, f) => s + f.qty, 0)
  const { date, hour } = toETInfo(openingFills[0].utcTime)

  const pnlPoints = direction === 'Long' ? exitPrice - entryPrice : entryPrice - exitPrice
  const outcome = pnlPoints > 0 ? 'Win' : pnlPoints < 0 ? 'Loss' : 'Breakeven'

  return {
    date,
    instrument: openingFills[0].product,
    direction,
    session: getSession(hour),
    outcome,
    entry_price: entryPrice,
    exit_price: exitPrice,
    contracts,
    rr: null,
    stop_price: null,
  }
}

export function parseTradovateCsv(csvText, sourceTz) {
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.trim())
  const idx = {}
  headers.forEach((h, i) => { idx[h] = i })

  // Parse and filter to filled orders only
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (!cols.length) continue

    const status = (cols[idx['Status']] || '').trim()
    if (status !== 'Filled') continue

    const fillTime = (cols[idx['Fill Time']] || '').trim()
    if (!fillTime) continue

    const bs = (cols[idx['B/S']] || '').trim()
    const qty = parseInt(cols[idx['Filled Qty']] ?? cols[idx['filledQty']] ?? '0')
    const price = parseFloat((cols[idx['Avg Fill Price']] ?? cols[idx['avgPrice']] ?? '').replace(/,/g, '') || '0')
    const product = (cols[idx['Product']] || '').trim()

    if (!qty || !price || !bs) continue

    const utcTime = localTimeToUTC(fillTime, sourceTz)
    if (!utcTime) continue

    rows.push({ bs, qty, price, product, utcTime })
  }

  rows.sort((a, b) => a.utcTime - b.utcTime)

  // Group into complete trades using position tracking with flip handling
  const trades = []
  let position = 0
  let openingFills = []
  let closingFills = []
  let direction = null

  for (const row of rows) {
    const signedQty = row.bs === 'Buy' ? row.qty : -row.qty
    const fill = { qty: row.qty, price: row.price, utcTime: row.utcTime, product: row.product }

    if (position === 0) {
      direction = signedQty > 0 ? 'Long' : 'Short'
      openingFills = [fill]
      closingFills = []
      position += signedQty
    } else if ((position > 0 && signedQty > 0) || (position < 0 && signedQty < 0)) {
      // Adding to existing position
      openingFills.push(fill)
      position += signedQty
    } else {
      // Closing (fully, partially, or flipping)
      const remaining = Math.abs(signedQty)
      const absPos = Math.abs(position)

      if (remaining < absPos) {
        // Partial close
        closingFills.push(fill)
        position += signedQty
      } else if (remaining === absPos) {
        // Full close
        closingFills.push(fill)
        position = 0
        trades.push(buildTrade(openingFills, closingFills, direction))
        openingFills = []
        closingFills = []
        direction = null
      } else {
        // Flip: close current trade, open new in opposite direction
        const closeQty = absPos
        closingFills.push({ ...fill, qty: closeQty })
        trades.push(buildTrade(openingFills, closingFills, direction))

        const newOpenQty = remaining - closeQty
        direction = signedQty > 0 ? 'Long' : 'Short'
        openingFills = [{ ...fill, qty: newOpenQty }]
        closingFills = []
        position = signedQty > 0 ? newOpenQty : -newOpenQty
      }
    }
  }

  return trades
}
