# 9-Trip ERP Frontend — Agent Guide

## Strategic Goal: Multi-Agent Content Pipeline for Phú Quốc

The AI system runs a **Multi-Agent architecture** with specialized agents forming a content pipeline:

```
Orchestrator → Researcher → Scoring → FilterDedup → Enrichment → Planner → Writer → MediaMaster → Publisher
```

Standalone services: Emily (chatbot), Hotel Crawler, Analytics (post-publish engagement).

**North Star**: `functions-ai/.9trip-agents/configs/prompts_master.js` — read this BEFORE writing any AI logic.

## Architecture

- **Vite root is `public/`** — source code lives under `public/src/`. Build output goes to `dist/` at root.
- **Multi-page app**: `public/index.html` (main) and `public/admin/index.html` (admin).
- **Singleton `window.A`** (`public/src/js/modules/core/app.js`) orchestrates everything. Modules register via `A.addModule(name, ClassOrObj)`.
- **Gatekeeper data flow**: Firestore → IndexedDB (Dexie via `DBLocalStorage.js`) → APP_DATA (RAM). Never write APP_DATA without persisting through IndexedDB first.
- **DBSchema.js** (`public/src/js/modules/db/DBSchema.js`) defines all collection schemas — read before adding/changing fields.
- **Node 24 required** — both `functions/` and `functions-ai/` have `"engines": { "node": "24" }`.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Dev server (port 3010) | `npm run dev` | Root-level Vite dev |
| Build | `npm run build` | Outputs to `dist/` |
| Preview build | `npm run preview` | Port 5000 |
| Firebase emulators | `npm run emulator` | Auth, Functions, Firestore, Hosting |
| Dev + emulators together | `npm run dev:all` | Uses `concurrently` |
| Deploy hosting | `npm run deploy:hosting` | Builds then deploys |
| Deploy ERP functions | `cd functions && npm run deploy` | |
| Deploy AI functions | `cd functions-ai && npm run deploy` | |
| Lint ERP functions | `cd functions && npm run lint` | |
| Lint AI functions | `cd functions-ai && npm run lint` | |

Firebase emulator data persists in `firebase-data/` (gitignored). Windows `predeploy` uses `npm.cmd run build`.

## Key Path Aliases (vite.config.js)

| Alias | Resolves To |
|-------|-------------|
| `@` | `public/src` |
| `@js` | `public/src/js` |
| `@db` | `public/src/js/modules/db` |
| `@md` | `public/src/js/modules` |
| `@core` | `public/src/js/modules/core` |
| `@acc` | `public/src/accountant` |
| `@cpt` | `public/src/js/components` |

## Two Functions Codebases

| Codebase | Directory | firebase.json key | Purpose |
|----------|-----------|-------------------|---------|
| `default` | `functions/` | `default` | ERP business logic (bookings, auth, transactions) |
| `ai-agents` | `functions-ai/` | `ai-agents` | AI sub-agents (Genkit + Gemini/DeepSeek) |

**All new AI code goes in `functions-ai/`**, never in `functions/`. Both share firebase-admin v13 dependency but deploy independently.

---

## AI Agents System (`functions-ai/`)

### Pipeline (8 steps, Orchestrator-managed)

| # | Agent | Model | Input | Output | Config |
|---|-------|-------|-------|--------|--------|
| 0 | **Orchestrator** | Gemini Flash | User source/URL | Coordinated pipeline | `prompts_master.js` |
| 1 | **Researcher** | Gemini 2.5 Flash | RSS URLs | Scored items | `researcher.config.js` |
| 2 | **Scoring** | Gemini Flash | Researcher items | Scored (4 dimensions) | `scoring.config.js` |
| 3 | **FilterDedup** | Gemini Flash | Scored items | Kept + removed | `prompts_master.js` |
| 4 | **Enrichment** | Gemini Flash | Filtered items | Matched products | `prompts_master.js` |
| 5 | **Planner** | Gemini Flash | Enriched items | Angle/target/format | `planner.config.js` |
| 6 | **Writer** | DeepSeek V4 Pro | Plan + context | Mobile First article | `writer.config.js` |
| 7 | **MediaMaster** | Gemini 2.5 Flash | Writer output | Media + logo overlay | `media-master.config.js` |
| 8 | **Publisher** | Social API | Approved content | Published posts | `publisher.config.js` |

**Standalone**: **Emily** (chatbot, Gemini 2.5 Flash), **Hotel Crawler** (DeepSeek V4 Flash), **Analytics** (post-publish engagement).

### Config files (`functions-ai/.9trip-agents/configs/`)

All agent behavior lives here — edit configs, not flow code.

| File | Agent |
|------|-------|
| `prompts_master.js` | **MASTER** — all agent definitions, model assignments, pipeline positions |
| `researcher.config.js` | Researcher — scrape prompts, scoring matrix, keywords |
| `scoring.config.js` | Scoring — 4-dimension weights (freshness, trend, businessRelevance, seasonFit) |
| `planner.config.js` | Planner — category→angle/target/media maps |
| `writer.config.js` | Writer — style, CTA rules, banned words, Mobile First rules |
| `media-master.config.js` | MediaMaster — visual analysis, logo overlay spec |
| `publisher.config.js` | Publisher — FB/TikTok API, token handling |
| `emily.config.js` | Emily — chatbot identity, tools mapping |
| `hotel-crawler.config.js` | Hotel Crawler — multi-page extraction rules |
| `analytics.config.js` | Analytics — engagement metrics |
| `index.js` | Hub — single require to get all configs |

Template variables: `{{url}}`, `{{maxItems}}`, `{{researcherData}}`, `{{format}}`, `{{lengthHint}}`, `{{styleHint}}`, `{{bannedWords}}` — replaced at runtime by flows.

### Flows (`functions-ai/ai/flows/`)

`orchestrator.flow.js`, `researcher-rss.flow.js`, `scoring.flow.js`, `filter-dedup.flow.js`, `enrichment.flow.js`, `planner.flow.js`, `writer.flow.js`, `media-master.flow.js`, `hotel-crawler.flow.js`, `chatbot.flow.js`, `analytics.flow.js`

### APIs (`functions-ai/api/`)

`orchestrator.api.js`, `researcher.api.js`, `writer.api.js`, `media-master.api.js`, `social-publisher.api.js`, `chat.api.js`, `crawler-trigger.api.js`, `import-ai.api.js`

### Core services (`functions-ai/ai/`)

- `ai.manager.js` — AiManager class (`extractJSON`, `generateWithTools`, `chatWithMemory`)
- `genkit-init.js` — Genkit AI initialization
- `tools/` — `db-skills.js`, `mcp-client.js`, `phuquoc-search.js`
- `services/` — `image-processor.service.js`, `video-processor.service.js`, `web-search.service.js`
- `schemas/index.js` — shared data schemas

### Sub-agents (`functions-ai/.9trip-agents/sub-agents/`)

`researcher_agent.js`, `writer_agent.js`, `media_master.js`, `publisher_agent.js` — orchestrators wrapping flows + configs + logging.

### Shared logic (`functions-ai/.9trip-agents/shared-logic/helpers.js`)

`log(agent, level, msg, meta)` — write agent reports to RTDB (`agent_reports/yyyy-mm-dd/`)

`validateResearchData(data, min)` — filter items meeting phuQuocRelevance score threshold

`pushToContentQueue(data)` — push content into Firestore `ai_content_queue`

---

## AI Content Rules (Mandatory)

### Mobile First for all AI Dashboards

- **Title**: Under 60 chars, one natural keyword. No all-caps.
- **Hook**: 1-2 engaging sentences. Never start with meaningless greetings.
- **Paragraphs**: Max 3 sentences. Sentences max 25 words.
- **Line breaks**: Every 2-3 sentences. No dense text blocks.
- **Emoji**: Max 2-3 per article.

### Content Rules

- **80% value + 20% soft CTA** — provide useful info first, suggest next steps gently.
- **Banned words** (`writer.config.js`): đặt ngay, mua ngay, giảm giá sốc, khuyến mãi Hot, chạy ngay, click ngay, deal khủng, flash sale, săn sale, siêu ưu đãi, chốt deal, fomo
- **Good CTAs**: experience-oriented suggestions, never pushy tour sales.
- **Tone**: Lively, approachable, like telling a story to a friend.

### Scoring Matrix UI

For scoring/review UIs, use the **Matrix Input** pattern:
- Each criterion = one row, each level = one column
- Click cell selects combo (criterion × level)
- Auto-calculate total score and display decision (Pass/Fail)
- Maps from `phuQuocRelevance` scoring matrix in `researcher.config.js`

> Score > 8/10 → auto-suggest saving to `training-data-vault`

---

## ERP Frontend Architecture

### Global State (`window.APP_DATA`)

```javascript
APP_DATA = {
  // Firestore collections (default format — key-value object: { id: doc })
  bookings: { 'bk-001': { id: 'bk-001', customer_name, ... }, ... },
  booking_details: { 'bd-001': { id: 'bd-001', booking_id, ... }, ... },
  operator_entries: { 'op-001': { id: 'op-001', booking_id, ... }, ... },
  customers: { 'c-001': { id: 'c-001', full_name, ... }, ... },
  transactions: { 'tx-001': { id: 'tx-001', type, amount, ... }, ... },

  // Object format (alternative — array of objects: [{ id, fieldName }, ...])
  bookings_obj: [{ id, customer_name, customer_phone, start_date, ... }],
  details_obj: [{ id, booking_id, hotel_name, check_in, ... }],
  operator_entries_obj: [{ id, booking_id, customer_name, check_in, ... }],
  customers_obj: [{ id, phone, full_name, dob, ... }],

  lists: { hotelMatrix, serviceMatrix, ... },
  currentUser: { uid, email, role, level, ... }
}
```

> ⚠️ **DATA FORMAT RULE**: All Firestore collections in `APP_DATA` default to **object format: `{ id: doc }`** (e.g., `APP_DATA.bookings['bk-001']` → `{ id: 'bk-001', ... }`). Access by key: `APP_DATA.bookings[id]` or `Object.values(APP_DATA.bookings)`. The `*_obj` arrays are auxiliary / legacy alternatives. When reading booking data, use `APP_DATA.bookings[id]` (not `bookings_obj`).

### Data Flow

```
Firestore → DBManager.loadAllData() → DBSchema conversion →
  [objectToArray() for legacy + objectToDisplay() for modern] →
    DBLocalStorage (Dexie IndexedDB) → APP_DATA (RAM) → UI
```

Save flow: Form → `getFormData()` → `arrayToObject()` → `DBManager.saveRecord()` → Firestore

When saving `booking_details`, operator trigger auto-syncs to `operator_entries` (merge: true, preserves operator-only fields).

### COL_INDEX Reference

All array-format column indices are defined in `public/src/js/modules/db/DBSchema.js`. Key prefixes:

- `M_*` — bookings (0-17)
- `D_*` — booking_details (0-16)
- `OP_*` — operator_entries (0-21)
- `C_*` — customers (0-9)
- `U_*` — users (0-8)

For the complete FIELD_MAP (index→field name), read `DBSchema.js` directly — it's the authoritative source.

### Role-Based Rendering

| Role | Table | Template | Can Edit | Can Delete |
|------|-------|----------|----------|------------|
| `sale`/`sales` | booking_details | `tpl_sales.html` | ✓ | ✓ |
| `op`/`operator` | operator_entries | `tpl_operator.html` | ✓ | ✗ |
| `acc`/`ketoan` | operator_entries | `tpl_operator.html` | Limited | ✗ |
| `admin` | both | both | ✓ | ✓ |

Role from `CURRENT_USER.role` (Firestore `users.{uid}`). Security enforced via `SECURITY_MANAGER` (CSS class-based + DOM cleanup).

### Helper First — Always

Use existing helpers before writing new code:

| Helper | For | Source |
|--------|-----|--------|
| `getE(id)` | `getElementById` | `utils.js` |
| `$(selector)` | `querySelector` | `utils.js` |
| `getVal(id)` / `setVal(id, val)` | Read/write inputs | `utils.js` |
| `A.Event.on()` | Event listeners (auto-cleanup + delegation) | `EventManager.js` |
| `formatMoney()` / `formatDateVN()` / `formatDateForInput()` | Format money/date | `utils.js` |
| `HD.getFormData(rootEl, col)` / `HD.setFormData(rootEl, data, col)` | Form data bidirectionally | `db_helper.js` |
| `Opps(error)` / `L.log()` | Error reporting | `utils.js` |

### Style

- **Prettier**: 4-space tabs, single quotes, `printWidth: 500`, ES5 trailing commas, semicolons
- **ESLint**: extends `prettier`, `no-console: off`, `no-unused-vars: warn`
- **Language**: Vietnamese for comments, UI text, commit messages

### No Test Framework

No test runner configured. No test scripts in `package.json`.

## Critical Files

### Frontend (ERP)
- `public/src/js/modules/core/app.js` — Application singleton (`A`)
- `public/src/js/modules/core/EventManager.js` — `A.Event`
- `public/src/js/modules/core/UI_Manager.js` — `A.UI`
- `public/src/js/modules/core/LoginModule.js` — `A.Auth`, Security
- `public/src/js/modules/core/LogicBase.js` — shared grid logic (filter, sort, search)
- `public/src/js/modules/core/ATable.js` — data table component
- `public/src/js/modules/db/DBSchema.js` — all collection schemas, COL_INDEX, FIELD_MAP
- `public/src/js/modules/db/DBManager.js` — Firestore CRUD + sync
- `public/src/js/modules/db/DBLocalStorage.js` — Dexie IndexedDB layer
- `public/src/js/libs/db_helper.js` — `HD` form helper
- `public/src/js/libs/utils.js` — global utilities

### Frontend Modules
- `public/src/js/modules/M_SalesModule.js` — Sales workflow
- `public/src/js/modules/M_OperatorModule.js` — Operator workflow
- `public/src/js/modules/AdminController.js` — Admin panel
- `public/src/js/modules/BookingOverviewController.js` — Booking overview
- `public/src/js/modules/OperatorController.js` — Operator controller
- `public/src/js/modules/ReportModule.js` — Reports
- `public/src/js/modules/ai/M_AiMarketing.js` — AI Marketing dashboard

### AI Frontend
- `public/src/components/tpl_ai_marketing.html` — Matrix Input UI template
- `public/src/js/modules/db/DBSchema.js` — includes `ai_content_queue` schema

### AI Agents (Target Codebase)
- `functions-ai/.9trip-agents/configs/prompts_master.js` — **NORTH STAR** — all agent configs
- `functions-ai/.9trip-agents/configs/index.js` — Config hub
- `functions-ai/.9trip-agents/rules/rules.md` — mandatory behavior rules
- `functions-ai/.9trip-agents/shared-logic/helpers.js` — log(), validate, pushToQueue
- `functions-ai/ai/ai.manager.js` — AiManager class
- `functions-ai/ai/genkit-init.js` — Genkit AI init
- `functions-ai/ai/flows/orchestrator.flow.js` — Pipeline coordinator

## Known Limitations

- **Customer name sync**: Operator entries cannot auto-populate customer name from booking during trigger sync.
- **Hard-coded admin emails**: Admin list in `SECURITY_MANAGER.ADMIN_EMAILS` (app.js config) requires code change.
- **No offline support**: All data in-memory; F5 loses unsaved changes.
- **Legacy array format**: Still in use alongside object format. Migration in progress.
