# IC3 — Trade Intelligence Journal

## What This App Is
End-to-end ICT/Smart Money Concept trading journal for futures traders. Covers the full session lifecycle: pre-market analysis → live session logging → trade entry/grading → weekly review. Built for Micro/Mini E-mini traders. Minimalist dark terminal aesthetic.

## Stack
- **Frontend**: React 19 + Vite (port 5173)
- **Backend**: Express 5 + better-sqlite3 (port 3001)
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` — streaming SSE on `/api/ai/analyze`
- **Styling**: Custom CSS design system (dark terminal aesthetic, IBM Plex Mono + Syne fonts)
- **Markdown rendering**: react-markdown (used in AI analysis output)

## Dev Commands
```bash
npm install       # first time only
npm run dev       # starts both server + client concurrently
```
If port 5173 is taken, Vite auto-increments. Server always runs on 3001.

**Known issue**: Express 5 requires `/{*path}` wildcard syntax, not `*`. Already fixed in `server/index.js`.

## Project Structure
```
src/
  App.jsx                     # Root: tab routing, settings state, logo = "IC3"
  tabs/
    PreMarketTab.jsx           # Pre-market analysis (TAB 1 — first in nav)
    JournalTab.jsx             # New trade entry form + AI analysis
    HistoryTab.jsx             # Daily Trades: calendar + trade list + Session Log
    WeeklyTab.jsx              # Weekly performance stats + AI review
    PsychTab.jsx               # Psychology / mood tracking
  components/
    SessionLog.jsx             # Intraday session log (5-theme structured capture)
    Settings.jsx               # Slide-out settings panel
    TradingCalendar.jsx        # Monthly P&L calendar
    CsvImportModal.jsx         # Tradovate CSV import modal
    ScoreDisplay.jsx           # A+/A/B/C/D/F grade display
    Lightbox.jsx               # Screenshot viewer
  utils/
    parseTradovateCsv.js       # CSV parser: groups fills → trades, handles flips/scaling
server/
  index.js                    # Express app — mounts all routes
  db.js                       # SQLite setup + full schema + all ALTER TABLE migrations
  routes/
    trades.js                  # CRUD + /import bulk endpoint
    ai.js                      # SSE streaming to Claude
    screenshots.js             # Multer file uploads → data/screenshots/
    premarket.js               # Pre-market plan CRUD (upsert by date)
    news.js                    # Forex Factory economic events cache
    session_notes.js           # Intraday session log CRUD + PATCH for setup validation
data/
  ic3.db                      # SQLite database (gitignored)
  screenshots/                 # Uploaded chart images (gitignored)
```

## Tab Order (Navigation)
1. Pre-Market
2. Journal (new trade)
3. Daily Trades (history + session log)
4. Weekly
5. Psychology

## Data Model — Trades
| Field | Type | Notes |
|-------|------|-------|
| date | TEXT | YYYY-MM-DD, stored in ET |
| instrument | TEXT | ES, MES, NQ, MNQ, YM, MYM |
| direction | TEXT | Long / Short |
| session | TEXT | London, NY AM, NY PM, Asia, Overnight |
| outcome | TEXT | Win / Loss / Breakeven / Scratch |
| entry_price, exit_price, stop_price | REAL | Futures prices |
| contracts | INTEGER | |
| rr | REAL | Auto-calc from entry/exit/stop |
| setup | TEXT | ICT setup type (from settings) |
| timeframe | TEXT | Entry timeframe |
| htf_bias | TEXT | Bullish/Bearish/Neutral/Uncertain |
| narrative, execution_notes, hindsight | TEXT | Free text |
| ai_analysis | TEXT | Full Claude response |
| grade | TEXT | A+/A/B/C/D/F |
| grade_score | INTEGER | 0–100 |
| criteria_checked | TEXT | JSON array |
| exec_entry/mgmt/patience/rules | INTEGER | Execution scores 1–10 |
| screenshot_paths | TEXT | JSON array of /data/screenshots/... paths |
| pre_mood, pre_confidence | INTEGER | Psychology fields (added via ALTER TABLE) |
| behaviors_noted, mental_state, belief, psych_commitment | TEXT | Psychology fields |

## Data Model — Pre-Market (`premarket` table)
One record per date (UNIQUE on date). Upserted via POST.
| Field | Notes |
|-------|-------|
| date | YYYY-MM-DD (unique) |
| session | AM / PM / Both |
| htf_bias | HTF directional bias text |
| mood, confidence | INTEGER sliders |
| key_levels | TEXT |
| narrative | TEXT — pre-session thesis |
| setups_watching | TEXT |
| game_plan | TEXT |
| news_events | TEXT |
| screenshot_paths | TEXT — JSON array |
| ai_analysis | TEXT — Claude streaming analysis |
| bias_verdict | TEXT — post-session: `confirmed` / `mixed` / `invalidated` |
| bias_verdict_notes | TEXT — notes on verdict |

## Data Model — Session Notes (`session_notes` table)
Timestamped intraday log. Each note is free text + optional theme + optional structured fields.

**Core fields**: id, date, time (HH:MM ET), note (text), created_at

**Theme** (`theme` column): `narrative | observation | setup | emotion | process`

**Theme-specific fields** (all nullable):
| Theme | Fields used |
|-------|-------------|
| narrative | `direction` (BULL/BEAR/NEUTRAL/FLIP), `conviction` (int 1-5) |
| observation | `price_level` (REAL) |
| setup | `setup_type`, `price_level`, `reaction_expected`, `invalidation_condition`, `setup_validated` (PENDING/TRIGGERED/INVALIDATED) |
| emotion | `intensity` (int 1-5), `state_tags` (JSON array: FOMO/Hesitation/Revenge/Overconfident/Fear) |
| process | `premarket_candidate` (bool — flag for pre-market checklist) |

**Also**: `trade_phase` (TEXT — pre_entry/in_trade/post_exit/between_trades/session_open/session_close)

**Legacy**: `tag` column still present (old system: observation/invalidation/trigger/mistake) — nullable, ignored in new UI.

## Data Model — News Events (`news_events` table)
Cached Forex Factory economic calendar. Fetched once per week.
Fields: event_date, event_time, title, country, impact, forecast, previous, actual, source
Also: `news_fetch_log` table tracks when each week was last fetched (avoids rate limiting).

## SessionLog Component
`src/components/SessionLog.jsx` — props: `date`, `readOnly` (default false), `label` (default "Session Log")

- Used in **HistoryTab** (live input mode, for selected date or today)
- Used in **HistoryTab trade detail** (readOnly mode, auto-surfaces notes for that trade's date)
- Returns `null` in readOnly mode when notes.length === 0 (no orphan headers)
- 5 theme buttons — selecting a theme reveals structured extra fields
- All theme-specific fields reset when theme changes or on submit
- Feed displays note metadata (direction badge, conviction dots, price level, setup status, intensity, state tags, pre-market flag)

## Pre-Market Tab
`src/tabs/PreMarketTab.jsx`

- Full pre-session form: session, HTF bias, mood/confidence sliders, key levels, narrative, setups, game plan, news events, screenshots
- AI analysis via SSE streaming (Claude reviews the plan)
- **Post-Session section** at bottom: bias verdict (Confirmed / Mixed / Invalidated) + notes
- Forex Factory news auto-loaded for the selected date (USD red/orange impact events)
- Upserts by date — safe to save multiple times

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
| GET | /api/premarket?date= | Get pre-market record for date |
| POST | /api/premarket | Upsert pre-market record by date |
| PUT | /api/premarket/:id | Partial update (screenshots, ai_analysis, verdict) |
| GET | /api/news?date= | Get news events for date (USD red/orange only) |
| POST | /api/news/fetch | Trigger Forex Factory fetch for current week |
| GET | /api/session-notes?date= | All notes for date, ordered by time |
| POST | /api/session-notes | Create note (all theme fields accepted) |
| PATCH | /api/session-notes/:id | Update setup_validated post-session |
| DELETE | /api/session-notes/:id | Delete note |

## Schema Migrations Pattern
All schema additions use safe try/catch ALTER TABLE loops in `server/db.js`. Adding a column that already exists throws — caught and ignored. This means `db.js` is always safe to restart without manual migrations.

## CSS Design Tokens
`--accent`, `--accent2`, `--text`, `--muted`, `--border`, `--danger`, `--surface`, `--bg`
Font stack: IBM Plex Mono (`--mono`), Syne (`--sans`)

## Code Conventions
- React functional components, no class components
- No TypeScript — plain JS/JSX
- Server routes use `better-sqlite3` synchronous API (no async/await needed)
- Auto-calculations (outcome, R:R, P&L) happen client-side
- AI prompts are defined as constants at the top of each tab file (e.g. `PREMARKET_SYSTEM`, `WEEKLY_SYSTEM`)
- Unicode in JSX must use `{'\uXXXX'}` expression syntax, not bare `\uXXXX` text

## CSV Import (Tradovate)
Parser in `src/utils/parseTradovateCsv.js`:
- Filters `Status = Filled` orders only
- Groups fills into trades, handles scaling in, partial closes, position flips
- Converts source timezone → ET using `Intl.DateTimeFormat` (handles DST)
- Supported timezones: ET, CT, MT, PT

## LLM Council Skill
`.claude/commands/council.md` — Karpathy-style multi-advisor framework.
Trigger: "council", "run the council", "war room this", etc.
Produces `council-report-[date].html` + `council-transcript-[date].md` in project root.
