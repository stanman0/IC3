# IC3 Knowledge Layer Specification
*Architectural decisions from LLM Council sessions (Apr 8 + Apr 12, 2026)*
*This document is the input spec for Session 4 and Session 5. Do not build synthesis logic until this spec is referenced in a prompt.*

## Core Architecture

**Pattern:** Karpathy LLM Knowledge Base (raw sources → compiled wiki → schema)
**Storage:** SQLite `trading_insights` table (not filesystem markdown)
**Retrieval:** FTS5 full-text search on topic + content_md
**Synthesis engine:** Anthropic API (separate call chain from 16-point grading)

### Three-Layer Mapping to IC3

| Karpathy Layer | IC3 Equivalent |
|----------------|----------------|
| Raw sources (immutable) | trades, session_notes, screenshots, contract_calendar |
| Compiled wiki (LLM-maintained) | trading_insights table |
| Schema (conventions) | 16-point ICT grading rubric + this spec document |

## Page Categories

| Category | Seeds From | Example Pages |
|----------|-----------|---------------|
| pattern | Graded trades by setup type | "London Silver Bullet Performance", "OTE Entry Discipline" |
| psychology | session_notes (theme=emotion) | "Revenge Trading Patterns", "Pre-Market Routine Impact" |
| session | Trades grouped by kill zone | "NY AM Session Edge Profile", "Asia Range as Day-Type Predictor" |
| setup | Trades grouped by entry model | "Breaker Block Entries: Conditions That Work" |
| meta | System-generated | "Knowledge Base Index", "Schema Evolution Log" |
| research | Backtest pipeline + overnight range data | "15-Year OTE Statistical Edge", "Asia Containment Day Types" |

## Session 4: Batch Build (Execute after 10-15 graded trades)

### Scope
1. Read ALL graded trades from trades + session_notes tables
2. For each trade, generate or update insight pages in trading_insights
3. Create the index page (category='meta', topic='Knowledge Base Index')
4. Reference screenshots by trade_id (existing filesystem path)
5. Run a "lint" pass: find contradictions, gaps, orphan concepts
6. Build GET /api/insights endpoint (list, search via FTS5, get-by-id)
7. Build /knowledge-base React route (category list → page detail view)

### Synthesis System Prompt Requirements
- Must encode ICT 2022 mentorship model rules (not just statistical aggregation)
- Must identify methodology VIOLATIONS — e.g., "entering Silver Bullets before 10:10 AM candle closes violates confirmation criteria"
- Must cross-reference session_notes psychology data (emotion themes, intensity, state_tags)
- Must note when backtest data supports or contradicts emerging patterns
- Output per call: updated markdown for each affected insight page + list of pages touched

### Retrieval Strategy
- On each synthesis call, query FTS5 for relevant existing pages
- Feed top 5-10 matching pages as context (not all pages — context window management)
- Budget: ~4K tokens for retrieval context, ~4K tokens for synthesis output
- Total per-trade synthesis cost: ~8K tokens via Anthropic API

### Idempotency
- Each trade maps to deterministic page set (based on setup type, session, psychology flags)
- Track which trades have been synthesized via source_trade_ids JSON array
- On failure mid-batch: resume from next un-synthesized trade
- version column increments on each page update (compounding signal)

## Session 5: Auto-Trigger (Execute after Session 4 validates)

### Scope
1. Hook into existing post-trade-review flow (after 16-point grading completes)
2. Trigger synthesis as SECOND Anthropic API call (separate from grading)
3. Pass: trade data + relevant FTS5 matches + grading output as context
4. Write updates back to trading_insights table
5. Show "Knowledge updated" indicator in trade review UI

### Cadence Design
- **Per-trade (automatic):** Lightweight updates to directly relevant pages only
- **Weekly (manual or scheduled):** Deep synthesis across ALL pages — cross-pattern connections, contradiction checks, statistical recalculations
- **On-demand:** "Lint" button in Knowledge Base UI — scan for stale claims, orphan pages, gaps

## Schema Evolution
The 16-point ICT grading rubric IS the Karpathy schema. It should evolve:
- After 50+ trades, knowledge layer may surface that certain rubric dimensions are not predictive of outcomes
- Candidate rubric refinements get logged in meta category page "Schema Evolution Log"
- Rubric changes require explicit user approval (never auto-modified by the system)

## Intentionally Deferred (Do NOT Build)
- Graph visualization (Obsidian-style) — FTS5 + category browsing is sufficient
- Multi-tenant / prop firm features — prove single-user value first
- Obsidian markdown export — optional future power-user feature
- Embedding-based vector search — FTS5 handles <500 pages fine
