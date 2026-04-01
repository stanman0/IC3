# IC3 — Trade Intelligence Journal

## What This App Is
ICT-focused trade journaling app. Traders log, grade, and get AI coaching on their futures trades. Built for Micro/Mini E-mini traders using Smart Money Concepts (ICT methodology).

## Stack
- **Frontend**: React 19 + Vite (port 5173)
- **Backend**: Express 5 + better-sqlite3 (port 3001)
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` — streaming SSE on `/api/ai/analyze`
- **Styling**: Custom CSS design system (dark terminal aesthetic, IBM Plex Mono + Syne fonts)

## Dev Commands
```bash
npm install       # first time only
npm run dev       # starts both server + client concurrently
```
If port 5173 is taken, Vite auto-increments. Server always runs on 3001.

**Known issue**: Express 5 requires `/{*path}` wildcard syntax, not `*`. Already fixed in `server/index.js:28`.

## Project Structure
```
src/
  App.jsx                     # Root: tab routing, settings state
  tabs/
    JournalTab.jsx             # New trade entry form + AI analysis
    HistoryTab.jsx             # Daily Trades: calendar + trade list + edit
    WeeklyTab.jsx              # Weekly performance stats + AI review
    PsychTab.jsx               # Psychology / mood tracking
  components/
    Settings.jsx               # Slide-out settings panel
    TradingCalendar.jsx        # Monthly P&L calendar (TradeZella-style)
    CsvImportModal.jsx         # Tradovate CSV import modal
    ScoreDisplay.jsx           # A+/A/B/C/D/F grade display
    Lightbox.jsx               # Screenshot viewer
  utils/
    parseTradovateCsv.js       # CSV parser: groups fills → trades, handles flips/scaling
server/
  index.js                    # Express app
  db.js                       # SQLite setup + schema
  routes/
    trades.js                  # CRUD + /import bulk endpoint
    ai.js                      # SSE streaming to Claude
    screenshots.js             # Multer file uploads → data/screenshots/
data/
  ic3.db                      # SQLite database (gitignored)
  screenshots/                 # Uploaded chart images (gitignored)
```

## Data Model — Trade Fields
| Field | Type | Notes |
|-------|------|-------|
| date | TEXT | YYYY-MM-DD, stored in ET |
| instrument | TEXT | ES, MES, NQ, MNQ, YM, MYM |
| direction | TEXT | Long / Short |
| session | TEXT | London, NY AM, NY PM, Asia, Overnight |
| outcome | TEXT | Win / Loss / Breakeven / Scratch |
| entry_price, exit_price, stop_price | REAL | Futures prices |
| contracts | INTEGER | Number of contracts |
| rr | REAL | Risk:Reward (auto-calc from entry/exit/stop) |
| setup | TEXT | ICT setup type (from settings) |
| timeframe | TEXT | Entry timeframe |
| htf_bias | TEXT | Bullish/Bearish/Neutral/Uncertain |
| narrative, execution_notes, hindsight | TEXT | Free text |
| ai_analysis | TEXT | Full Claude response |
| grade | TEXT | A+/A/B/C/D/F |
| grade_score | INTEGER | 0–100 |
| criteria_checked | TEXT | JSON array of met criteria |
| exec_entry/mgmt/patience/rules/risk | INTEGER | Execution scores 1–10 |
| screenshot_paths | TEXT | JSON array of /data/screenshots/... paths |

## Key Computed Values (client-side only, never stored)
- **P&L $** = `(exit - entry) * contracts * pointValue` (Long) or reverse (Short)
- **Risk $** = `|entry - stop| * contracts * pointValue`
- **Point values**: ES=50, MES=5, NQ=20, MNQ=2, YM=5, MYM=0.5, RTY=50, M2K=5

## Grade Algorithm
`score = (criteria_met/total_criteria * 100 * 0.5) + (exec_avg/10 * 100 * 0.5)`
5 execution dimensions: entry precision, trade management, patience, rule adherence, risk management.
Risk management auto-grades against `settings.maxRiskPerTrade` if set.

## Settings (localStorage)
| Key | Value |
|-----|-------|
| ic3_instruments | JSON array |
| ic3_directions | JSON array |
| ic3_setups | JSON array |
| ic3_criteria | JSON array |
| ic3_behaviors | JSON array |
| ic3_max_risk_trade | number or null |
| ic3_max_risk_day | number or null |

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/trades | All trades DESC |
| POST | /api/trades | Create trade |
| PUT | /api/trades/:id | Update trade |
| DELETE | /api/trades/:id | Delete trade |
| POST | /api/trades/import | Bulk insert (CSV import) |
| POST | /api/ai/analyze | SSE streaming AI analysis |
| POST | /api/screenshots/upload | Upload images (multer, max 10) |
| DELETE | /api/screenshots/:tradeId/:filename | Remove screenshot |

## CSV Import (Tradovate)
Parser lives in `src/utils/parseTradovateCsv.js`. Key logic:
- Filters `Status = Filled` orders only
- Sorts by Fill Time, tracks running position
- Groups fills into trades: opening fills (adding to position) + closing fills (reducing)
- Handles **scaling in**, **partial closes**, and **position flips** (e.g., long 3 → sell 5 → short 2)
- Converts source timezone → ET using `Intl.DateTimeFormat` (handles DST automatically)
- Supported source timezones: ET, CT, MT, PT

## Code Conventions
- React components use functional style, no class components
- CSS uses design tokens (`--accent`, `--text`, `--muted`, `--border`, `--danger`, `--accent2`)
- No TypeScript — plain JS/JSX throughout
- Server routes use `better-sqlite3` synchronous API (no async/await needed)
- Auto-calculations (outcome, R:R, P&L) happen client-side in `updateForm` handlers
