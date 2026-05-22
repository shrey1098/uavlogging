# DECISIONS.md — Strikers UAV Performance System

**Produced by STIFF · For 17 JAK LI**

Single source of truth for architectural and product decisions. This chat
(architecture) authors entries. Layer chats (backend / frontend / parser /
seed) read this file, execute their slice, and report status back through
the human committer.

This file is **append-only**. Never edit a closed entry's decision text —
supersede it with a new entry instead.

---

## How to use this file

1. A concept is settled in the architecture chat.
2. Architecture chat emits a numbered entry.
3. Human commits the entry to this file in the repo.
4. Repo re-syncs. Each layer chat reads this file directly.
5. Layer chat executes its per-layer actions, hands code back to the human.
6. Human commits code, updates the entry's status line.

### Status values

| Status | Meaning |
|---|---|
| `OPEN` | Decided, no implementation started |
| `IN PROGRESS [layer]` | That layer is executing |
| `DONE [layer]` | That layer's slice complete and committed |
| `CLOSED` | All layers done |
| `SUPERSEDED BY #NNN` | Replaced by a later entry |

### Entry template

```
## #NNN — <title>
- Date:
- Status:
- Decision:
- Rationale:
- Per-layer actions:
  - Backend:
  - Parser:
  - Frontend:
  - Seed:
- Notes:
```

---

# PART A — CURRENT STATE BASELINE

This part records what exists **as of repo sync, 17 May 2026**. It is a
factual baseline, not a set of decisions to execute. Future decisions
(Part B onward) build on or modify this baseline.

## System shape

Three independently deployed services plus object storage:

- **Frontend** — SvelteKit 2, Svelte 5 (runes), TypeScript, Tailwind,
  shadcn-svelte (bits-ui), TanStack Query (Svelte), LayerChart, Axios.
  Mobile-first, single codebase. Palette scarlet / black / gold (JAK LI
  regimental colours). Operator screens mobile-first; commander screens
  desktop-first.
- **Backend** — Node.js + Express + MongoDB Atlas (Mongoose). JWT auth:
  Bearer access token + httpOnly refresh cookie. Two roles: `super_admin`
  (commander), `operator` (pilot). CRUD routes generated via a shared
  `crudBuilder`.
- **Parser** — Python FastAPI microservice. `POST /parse` accepts a job,
  processes async (FastAPI BackgroundTasks), returns 202. Supports
  ArduPilot BIN/TLOG, PX4 ULog, CSV, KML, Skydroid. Downloads the log
  from R2 to a temp file, parses, writes `ParsedFlightData` to MongoDB.
- **Storage** — Cloudflare R2 for raw log files.

Dispatch path: backend `parserWorker.js` → HTTP POST to parser
`/parse` with `log_id`, `file_url`, `log_type`, `mongo_uri`.

## Data models (backend, Mongoose)

- **User** — auth identity. Roles `super_admin` | `operator`.
- **Operator** — pilot record (name, licenceNumber, etc.). Distinct from
  User.
- **Drone** — airframe record. Tracks `totalFlightHours` among others.
- **Battery** — battery asset. Lifecycle tracking via embedded `cycles[]`
  (`batteryCycleSchema`), `cycleCount`, `maxCycles`, virtual
  `healthPercent`, status `active|needs_inspection|retired|storage`.
  Each cycle references a `Mission`.
- **Mission** — tasking/grouping entity. References `owner`, `drone`,
  `operator`, `batteries[]`, optional `flightLog`. Carries `missionType`
  enum, `status` (`draft|pending_verification|verified|archived`),
  geo `location` (2dsphere indexed), planned/actual timing, parser-
  populated flight stats, conditions, waypoints, notes, tags.
- **FlightLog** — raw uploaded log file. References `owner`, optional
  `mission` (default null). File metadata, `logType` enum,
  `parseStatus` enum (`pending|processing|completed|failed|skipped`),
  parse timing/error, link to `parsedData`.
- **ParsedFlightData** — parser output. References `flightLog` (unique),
  optional `mission`, required `owner`. Holds `summary`, telemetry,
  flight path, events, alerts, flight modes, anomaly score.

## Mission entity dependency map (as built)

`Mission` is currently load-bearing across all three layers:

- Backend: own model + `routes/missions.js` (CRUD via `crudBuilder`);
  referenced by `FlightLog.mission`, `ParsedFlightData.mission`,
  `Battery.cycles[].mission`.
- Parser: `main.py` resolves `mission_id` from the FlightLog and calls
  `update_mission_stats(...)`; `write_parsed_data(...)` takes `mission_id`.
- Frontend: `Mission`, `MissionType`, `MissionStatus`,
  `CreateMissionRequest` types; `FlightLog.mission` is non-optional in
  the frontend type; `FlightLogUploadResponse` returns a `Mission`.
- Seed: `seed.js` imports and seeds `Mission`.

## Seed data state

Deterministic seed (`seed.js`, fixed RNG seed 42). Rajasthan sectors
(Jodhpur, Jaisalmer, Barmer, Bikaner, …). Loaded volume per project
brief: 14 operators, 12 drones, 20 batteries, 40 missions, ~80 flight
logs with telemetry.

## Known contract drifts (recorded, not yet decided)

These are factual mismatches found at sync. No fix is mandated here;
they exist as candidates for future entries.

1. **parseStatus enum mismatch.** Backend `FlightLog.parseStatus` =
   `pending|processing|completed|failed|skipped`. Frontend
   `ParseStatus` = `queued|parsing|parsed|failed`. The two will not
   agree on the wire.
2. **FlightLog field-name drift.** Backend `FlightLog` uses
   `originalName`, `storedName`, `filePath`. Frontend `FlightLog` type
   uses `originalFilename`, `storedPath`, `fileExtension`. Frontend also
   models `telemetry/events/alerts` directly on `FlightLog` whereas
   backend keeps those on `ParsedFlightData`.
3. **Mission optionality drift.** Backend `FlightLog.mission` is
   optional (`default: null`); frontend `FlightLog.mission` is required
   (`string | Mission`).

## Test credentials (seed)

| Email | Role |
|---|---|
| admin@dronedebrief.dev | super_admin |
| operator@dronedebrief.dev | operator |

---

# PART B — DECISIONS

## #001 — Drone schema extension + 17 JAK LI fleet import

- Date: 2026-05-18
- Status: OPEN
- Decision:
  Extend the `Drone` model for the live 17 JAK LI fleet import. Full DB
  wipe and reseed from CSV — no migration, no preservation of existing
  values.

  New `Drone` fields:
  - `propSize` — String, nullable (e.g. "10 inch", "2.5 inch")
  - `nightCapability` — String, default literal `"Nil"` (e.g. "Low Light
    Camera"). Default is the string "Nil", not null/empty — frontend must
    render it as a value, not treat it as missing.
  - `range` — Number, kilometres, nullable
  - `ewCompliance` — String, default literal `"Nil"`
  - `remarks` — String, nullable, freetext

  Changed field (BREAKING CONTRACT CHANGE):
  - `payloadCapacity` — type/unit changes Number(grams) → Number(kilograms),
    nullable. Field semantics change permanently. No value migration; full
    wipe-and-reseed is the migration path. Frontend must update any label,
    display, or input that assumed grams.

  `frameType` enum extension: add `trg`, `fpv_quadcopter`. Import maps
  `10_inch_fpv_quadcopter` and `5_inch_fpv_quadcopter` → `fpv_quadcopter`
  (prop size captured separately in `propSize`). `trg` = training
  micro-class, kept as-is.

  `status` enum: unchanged, stays `['active','inactive']`. Import trims
  whitespace before validation ("active " → "active").

  Super_admin holds full CRUD on drone records (create new airframes,
  edit field values on existing ones). Standard CRUD only — no runtime
  schema mutation. Operator role is read-only on drone inventory (see
  #002).

- Rationale:
  Live fleet replaces placeholder seed. Schema must carry the real
  attributes 17 JAK LI tracks. payloadCapacity unit corrected to kg to
  match how the unit specifies airframes; breaking change is acceptable
  because the entire DB is wiped, leaving no live data to migrate.

- Per-layer actions:
  - Backend: Add the five new fields + change `payloadCapacity` type to
    the `Drone` Mongoose schema. Extend `frameType` enum with `trg`,
    `fpv_quadcopter`. Write CSV-import seed script with the documented
    field maps, whitespace trim, and frameType mapping. Wipe and reseed
    DB. Expose new fields through drone API (read for all auth users,
    write for super_admin only — see #002).
  - Parser: No action. Parser does not touch drone schema.
  - Frontend: Surface the five new fields in drone views and super_admin
    drone create/edit forms. Update any `payloadCapacity` display/input
    that assumed grams — now kilograms. Render `"Nil"` defaults as
    values, not empty states.
  - Seed: Superseded by backend CSV-import seed for this import. No
    separate seed action.

- Notes:
  Data-quality items are tracked in Notion, not here: weak CSV passwords
  flagged (won't satisfy API password policy if later changed via API);
  duplicate email resolved (AV Rajnish Kumar → rajnishkumar@stiff.dev).
  These are row-level fixes, not contract decisions.

---

## #002 — Access model: per-operator isolation + shared read-only drone inventory

- Date: 2026-05-18
- Status: OPEN
- Decision:
  Consolidates and closes the previously pending Mission-scope /
  data-isolation question. Mission entity is **retained** — not dropped.

  User base: full user-table wipe and reseed. 26 individual operator
  accounts + 2 super_admin, single unit "17 JAK LI".

  Isolation rules:
  - An `operator` may upload and view only their own flight logs. No
    visibility into other operators' flight logs.
  - `super_admin` sees all flight logs and missions across the unit.
  - Drone inventory is shared read-only to all authenticated users. An
    `operator` has GET-only on drones — no POST, PATCH, or DELETE.
  - Drone create/edit/delete is `super_admin` only.

  Mission rules:
  - Mission creation is `super_admin` only. An `operator` cannot create
    a mission.
  - On flight-log upload, the operator selects a drone from a dropdown
    (required) and may optionally select an existing mission from a
    dropdown. Mission is not mandatory — default empty/none.
  - An `operator` may only select existing missions, never create one
    during upload or elsewhere.

- Rationale:
  Product thesis is operator performance tracking and drone
  health/maintenance. Operators must not see each other's performance
  data — isolation is a readiness-integrity requirement. Drone inventory
  is unit-shared reference data, so read-all is correct; mutation stays
  with command. Missions retained as an optional grouping under command
  control; making creation super_admin-only prevents operators polluting
  the tasking record while still letting them tag a flight to a real
  tasking when one exists.

- Per-layer actions:
  - Backend: Enforce per-operator ownership filter on flight-log and
    mission read/list endpoints (operator → own only; super_admin →
    all). Restrict drone write routes to super_admin; drone read open to
    all auth users. Restrict mission-create route to super_admin. Reseed
    users: 26 operators + 2 super_admin, unit "17 JAK LI". Resolves the
    Part A "Mission optionality drift" — `FlightLog.mission` is optional
    (nullable), authoritative.
  - Parser: No action.
  - Frontend: Flight-log upload — drone dropdown (required), mission
    dropdown (optional, default none). Hide/disable mission-create UI
    for operator role; available to super_admin only. Enforce role-based
    visibility so operators see only their own logs/missions. Align
    frontend `FlightLog.mission` type to optional to match backend
    (closes Part A drift #3).
  - Seed: Covered by backend user reseed. No separate action.

- Notes:
  This entry closes the long-pending Mission-scope decision: Mission
  stays, optional, command-controlled. Part A drift #3 (Mission
  optionality) is resolved here in favour of optional/nullable.
  Drifts #1 (parseStatus enum) and #2 (FlightLog field names) remain
  open — separate future entries.

---

## #003 — Operator gamification: readiness score + tiered achievement badges

- Date: 2026-05-18
- Status: OPEN
- Decision:
  Replace all hardcoded/placeholder readiness and achievement display
  with a computed system. Baseline (Part A) confirmed: today the
  readiness score, skill bars, and achievements are static literals in
  the frontend; the only genuinely computed metric is the parser's
  per-flight `anomalyScore`.

  ### 1. Readiness score (per operator, 0–100, computed)
  Weighted composition. All constants are named, tunable parameters —
  they may be adjusted later WITHOUT a new decision entry (tuning is a
  Notion-tracked minor change; only the component set/weights below are
  binding).

  | Component | Weight | Definition |
  |---|---|---|
  | Flight Quality | 40 | `100 − avg(anomalyScore)` across the operator's flights |
  | Currency | 25 | Full marks if flown within last 14 days; linear decay to 0 by 60 days since last flight |
  | Experience | 20 | Log-scaled accumulated flight hours; plateaus (~diminishing past ~100h) |
  | Volume | 10 | Log-scaled total sortie count; plateaus |
  | Live Ops | 5 | Non-zero if operator has any Real Ops flights on record |

  `anomalyScore` definition (for commander interpretation, recorded so
  it is not misread): parser-computed 0–100 per flight, higher = worse.
  Weighted sum of telemetry alerts (crash 40, failsafe 25, EKF variance
  20, fence breach 20, voltage sag 15, GPS glitch 12, vibration 10,
  motor imbalance 10, battery low 10; critical severity ×1.5), flight
  events, voltage-sag depth, and GPS-quality penalty; capped at 100. It
  measures how poor the flight DATA looks, not strictly pilot fault — a
  drone fault and pilot error both raise it. Acceptable as a coarse
  skill signal because it is only 40% of readiness and averaged over
  many flights, but commanders must read it as data-quality, not a
  clean blame metric.

  ### 2. Achievement badges (tiered, count-based)
  Two independent classification axes, BOTH selected by the operator at
  flight-log upload (alongside the required drone selection), each
  strictly single-select:

  - **Time axis** — `Day` | `Night`
  - **Type axis** — `Surveillance` | `Drop` | `Obstacle Training` |
    `Navigation/Waypoint` | `FPV` | `Maintenance Test Flight`

  One sortie increments its Time badge AND its Type badge
  independently. Example: a night drop → Night +1 and Drop +1.

  `Maintenance Test Flight` is a loggable Type value that increments
  NOTHING — not its Type badge, not the Time badge, not currency, not
  any readiness component's volume/experience count. It exists purely
  so a post-repair check sortie has an honest record and is not
  mis-tagged as a skill sortie. Flights of this Type are excluded from
  all gamification and from the Volume/Experience readiness inputs.

  Badge tiers per category (count thresholds, Tier 1 → Tier 10),
  uniform across all Time and Type categories:
  `5 · 10 · 20 · 35 · 60 · 100 · 150 · 225 · 325 · 500`

  ### 3. Real Ops badge (commander-gated)
  Separate category, 5 tiers, thresholds (real-mission count):
  `1 · 3 · 7 · 15 · 30`
  Counts purely on number of Real Ops flights flown by the operator.
  It does NOT inspect Time/Type sub-classification for tier purposes
  (a real op may carry Time/Type metadata, but only the real-op count
  drives this ladder).

  ### 4. Classification authority
  Every sortie is TRAINING by default. A flight counts as Real Ops ONLY
  when the commander (`super_admin`) uploads it and assigns it to a
  specific operator via the Real Ops upload path. Operators can never
  self-classify a flight as Real Ops. This refines the sortieType
  essence call: training/live is not an operator-set field — live is
  exclusively commander-asserted at upload.

  ### 5. Display rule
  Only the HIGHEST earned tier per category is displayed (not the full
  tier history). Shown in two places: the commander operators-list
  (against each operator's name) and the operator's own profile page.

- Rationale:
  Product thesis is operator performance tracking. A readiness number
  and achievement set that are hardcoded are theatre, not a record.
  This makes them computed from real flight data. Quality-dominant
  weighting keeps the score honest; heavy currency weighting ensures a
  skilled-but-stale pilot reads as not-ready, which is the commander's
  actual need. Compounding tier ladder gives early motivation and a
  meaningful long-service ceiling. Commander-gated Real Ops prevents
  operators inflating live-readiness; maintenance exclusion prevents
  airframe checks padding pilot skill.

- Per-layer actions:
  - Backend: Add achievement/progress data model — per-operator
    per-category sortie counters + derived current tier; achievement
    definitions (category, tier thresholds) as the ladders above. Add
    `timeClass` (`day|night`) and `typeClass`
    (`surveillance|drop|obstacle|navigation|fpv|maintenance_test`)
    fields to the flight-log model, set at upload. Implement readiness
    computation service with the five named components and tunable
    constants; expose via API for operator (own) and super_admin (all).
    Increment logic: on a counted flight, +1 to the matching Time and
    Type counters; `maintenance_test` increments nothing and is
    excluded from Volume/Experience inputs. Real Ops counter increments
    only on commander Real-Ops upload path. Enforce that Real Ops
    classification is settable only by `super_admin` (ties to #002
    access model).
  - Parser: No structural action. `anomalyScore` already produced and
    is consumed as-is by the backend readiness service. Confirm no
    parser change required.
  - Frontend: Flight-log upload — add Time single-select and Type
    single-select alongside the existing required drone dropdown
    (#002). Replace hardcoded readiness hero, skill bars, and
    achievements with values from the new API. Render only highest tier
    per category. Surface badges on the commander operators-list and on
    the operator's own profile. Real Ops upload UI is commander-only
    (operator never sees a Real Ops classification control).
  - Seed: When seed/reseed runs, populate realistic per-operator
    sortie distributions across Time/Type so badge tiers and readiness
    scores render meaningfully in the demo. No separate decision; rides
    the #001/#002 reseed.

- Notes:
  Readiness tuning constants (decay window, plateau curves) are
  adjustable as Notion-tracked minor changes — only the component set
  and weights here are binding. Real Ops category name is provisional;
  if renamed, that is a label-only Notion change unless it alters the
  data contract.

---

## #004 — Restore HTTP dispatch between backend and parser

- Date: 2026-05-22
- Status: OPEN
- Decision:
  The backend → parser wire is HTTP, not subprocess. Restore the
  Session-2 HTTP dispatch architecture, which is the system's intended
  design and was working end-to-end before being accidentally
  overwritten during #003 backend execution.

  ### 1. Architecture (binding)

  - **Backend** dispatches parse jobs via `fetch(PARSER_SERVICE_URL/parse, …)`
    with JSON body `{ log_id, file_url, log_type, mongo_uri }`.
    `file_url` is the R2 URL (presigned where required), NOT a local
    path. Backend does NOT spawn the parser as a child process.
  - **Parser** remains a FastAPI service exposing `POST /parse` and
    `GET /health`. Accepts the HTTP body, downloads from `file_url` via
    `httpx`, processes as a FastAPI BackgroundTask, returns 202 Accepted
    immediately. Parser does NOT accept argv / CLI invocation.
  - File transfer between backend and parser is via R2 URL, never local
    disk. This is what makes the wire deployment-portable.

  ### 2. Deployment shape (initially)

  Backend and parser are hosted on the **same cloud host** at first.
  Backend reaches the parser at a same-host URL
  (e.g. `http://localhost:PORT` or an internal address) — the dispatch
  mechanism is identical whether the parser is on the same host or a
  remote one. No architectural difference between the two deployments.

  ### 3. Future-portability requirement (binding)

  Code in BOTH backend and parser must carry inline comments marking
  the boundaries that change when the parser is later migrated to its
  own cloud host. These are not TODOs — the design already works for
  the migrated case; the comments exist to make the migration
  surface obvious during a future move.

  Required comment markers (exact wording flexible; intent binding):

  - Backend `parserWorker.js`, at the `PARSER_SERVICE_URL` config read:
    `// #004 portability: parser URL — change when parser is hosted on
    a separate cloud service.`
  - Backend `parserWorker.js`, at the `fetch(...)` dispatch call:
    `// #004 portability: HTTP dispatch boundary. No code change
    required to retarget across hosts; only PARSER_SERVICE_URL
    moves.`
  - Parser `main.py`, near the `POST /parse` handler:
    `// #004 portability: this is the cross-host entrypoint. File
    transfer is by R2 URL (file_url), already host-independent. No
    structural change required when parser moves to its own host.`

  ### 4. #003 progress hook re-attachment (binding)

  The #003 gamification progress hook (`applyProgressForLog`) was
  added in the regressed subprocess version inside the `child.on(
  'close')` callback. On the restored HTTP dispatch this is the wrong
  attachment point — there is no subprocess close event.

  Correct attachment point on the HTTP dispatch: the progress hook
  fires when the parse is **confirmed complete**, i.e. when the
  `FlightLog.parseStatus` transitions to `completed` AFTER the parser
  has written `ParsedFlightData` and returned. Since the FastAPI
  parser processes asynchronously via BackgroundTasks and the HTTP
  POST returns 202 Accepted immediately (not on completion), the hook
  cannot fire on the HTTP response.

  Backend must attach the progress hook to the point where the
  backend itself detects parse completion. Options the backend chat
  may choose between (no architectural decision needed from this
  chat — implementation detail):
  - A status-poll / completion check that runs after dispatch.
  - The parser calling a backend webhook on completion (introduces a
    second wire — out of scope for #004, may revisit later).
  - A Mongoose post-update hook on `FlightLog.parseStatus = completed`.

  Whichever mechanism is chosen, the binding constraint is: the
  progress hook fires exactly ONCE per successful parse, never on
  failed parses, never on maintenance-test logs (already gated inside
  the progress service per #003).

- Rationale:
  The HTTP dispatch is not a new design choice — it is the existing
  intended design, accidentally overwritten in #003 execution due to a
  workspace-staleness error in the backend chat (confirmed). Restoring
  it costs less than the alternative and matches the deployment direction
  (R2 already in use, parser CPU profile worth isolating). The
  subprocess version cannot stand: the parser is FastAPI and does not
  accept argv, so dispatch as currently shipped will fail at runtime
  regardless. Deciding "Path B" formally on the record prevents future
  accidental reverts being treated as architectural drift rather than
  regressions.

- Per-layer actions:
  - Backend: Replace the current `child_process.spawn(...)` implementation
    of `parserWorker.js` with the HTTP-dispatch implementation
    (`fetch(PARSER_SERVICE_URL/parse, …)` posting `log_id`, `file_url`,
    `log_type`, `mongo_uri`). Restore the `PARSER_SERVICE_URL` env var.
    The flightLog upload controller must pass the R2 URL (`fileUrl`),
    not a local file path, to dispatch. Remove the `--file`, `--log-id`,
    `--type`, `--mongo-uri` argv path. Re-attach the #003
    `applyProgressForLog` hook to the parse-completion detection point
    on the backend side (not to a subprocess close event). Add the
    portability comments at the two sites named above.
  - Parser: No structural change. Confirm `POST /parse`, `GET /health`,
    `ParseJob` body shape, and BackgroundTask processing remain the
    contract. Add the portability comment at the `POST /parse` handler.
  - Frontend: No action. Upload flow already posts to the backend
    upload endpoint; how the backend dispatches to the parser is not a
    frontend concern.
  - Seed: No action.

- Notes:
  Regression source recorded: accidental subprocess revert during
  Session 7 (#003 backend execution) — workspace state in the backend
  chat carried the Session 1 subprocess implementation, and the #003
  progress hook was added on top of that stale base. Not a deliberate
  architectural choice. No subprocess advantage on record.

  #003 status: the gamification feature itself is not invalidated;
  only the attachment point of the progress hook moves. Backend will
  re-apply the hook to the HTTP-dispatch path during #004 execution.
  Once #004 is DONE, #003's progress mechanism becomes truly active —
  prior to #004 it was attached to dead code (the subprocess close
  event that never fires against a FastAPI service).

  Future migration of parser to its own cloud host: NOT a new
  decision when it happens — only `PARSER_SERVICE_URL` and the parser
  deployment target change. The architecture in this entry already
  supports that move; comments mark the surface.