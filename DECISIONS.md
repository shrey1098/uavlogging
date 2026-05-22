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
- Status: DONE [backend], DONE [frontend], DONE [seed] — CLOSED
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
- Status: DONE [backend], DONE [frontend], DONE [seed] — CLOSED
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
- Status: DONE [backend], DONE [frontend profile], OPEN [frontend home — hardcoded readiness/chips still present, see #007/Notion]
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
- Status: DONE [backend], DONE [parser] — CLOSED
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

---

## #005 — Cloudflare R2 as canonical file store for flight logs

- Date: 2026-05-22
- Status: DONE [backend] — CLOSED (parser/frontend no-action per entry)
- Sequencing: This entry MUST land before #004's backend slice can
  be executed. #004 dispatches a `file_url` to the parser; that URL
  is what this entry provides. Backend chat is on hold for #004
  pending #005.

### Context (correction of Part A)

The Part A baseline records "Storage — Cloudflare R2 for raw log
files" and "Backend `parserWorker.js` → HTTP POST to parser `/parse`
with `log_id`, `file_url`, …". Verification against the synced repo
during #004 execution found:

- No R2 SDK present in backend.
- `config/upload.js` is multer disk storage to a local `UPLOAD_DIR`.
- `FlightLog` model has `filePath` (local) but no `fileUrl`.
- The upload controller writes a local path; no upload-to-R2 step
  exists.

Part A was authored from an out-of-date report. Treating Part A as
append-only: this entry **supersedes** the storage and dispatch
claims in Part A as they pertain to file transfer. The repo, not
Part A, is the truth.

### Decision

Adopt Cloudflare R2 as the canonical store for raw flight-log files
from the moment of upload onward. Build the R2 integration now —
not deferred to the eventual parser-host split — because:

1. #004's HTTP dispatch requires a `file_url` the parser can fetch
   from any host. R2 provides exactly that, today, with no later
   rewrite when the parser is migrated.
2. Flight logs are the unit's readiness record. Storing them only
   on a single host's local disk means a host failure destroys the
   record. R2 provides durability for negligible cost (R2 storage
   billed per-GB at sub-dollar monthly volumes given fleet scale).
3. Engineering effort is roughly equivalent whether done now or at
   migration; doing it now removes a future cutover risk and
   eliminates the dead-pipe interval that Choice A in the cost
   analysis would have created.

### Binding shape

- **Backend** uploads every incoming flight log to R2 at receive
  time. After successful R2 PUT, the file is written to R2 ONLY.
  No long-lived local copy on the backend host.
- **`FlightLog` model** gains a `fileUrl` field (string, required
  on completed uploads). `filePath` is retired from the role of
  parser-input source; if retained for any transient purpose
  (e.g. multer's temp upload location before the R2 PUT), it must
  not be relied on after upload completes.
- **R2 object key** convention: `flight-logs/<flightLogId>/<storedName>`.
  Predictable, owner-scoped recovery possible.
- **Access to the file** from the parser is via the `fileUrl` field.
  URL form is **presigned, time-limited** (recommend 1-hour TTL),
  generated at dispatch time — not stored permanently in the
  database. The database stores the canonical R2 object reference
  (bucket + key); the presigned URL is generated fresh for each
  parse dispatch.
- **Bucket scope**: one R2 bucket for the system. No public access.
  Backend holds the only credentials. Presigned URLs are the only
  way the parser (or any other consumer) reads from it.

### Operational and cost envelope

- R2 bucket lives in the same Cloudflare account as the future
  cloud host. Within the unit's scale (26 operators, projected log
  volume), monthly R2 cost is expected sub-$5 — recorded as
  context, not a binding figure.
- No CDN or public distribution layer. Logs are operational data,
  not content.
- Retention policy: indefinite for now. Lifecycle/archival rules
  are a separate later decision when total volume warrants them.

### #004 unblock

Once #005 is DONE on the backend side:
- `FlightLog.fileUrl` exists and is populated on every upload.
- Backend can dispatch to parser with `file_url` being the
  freshly-generated presigned R2 URL.
- #004's backend slice executes against a real `fileUrl`. Backend
  chat resumes #004 work at that point — not before.

- Rationale:
  Same-host deployment does not eliminate the need for cross-host
  file access; it only delays it. Building R2 now costs roughly
  what building it later costs, but removes the migration cutover
  risk and — more importantly for a military readiness record —
  gives the unit's flight-log history durability beyond a single
  host's disk. The cost differential at this scale is not
  meaningful (cents to single dollars monthly). The durability
  differential is meaningful: disk-only storage on one server puts
  the readiness record one hardware failure away from loss.

- Per-layer actions:
  - Backend: Add Cloudflare R2 SDK (AWS S3 SDK with R2 endpoint,
    standard). Add bucket credentials to env (`R2_ACCOUNT_ID`,
    `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
    `R2_ENDPOINT`). In the upload controller: after multer accepts
    the file, PUT it to R2 at the key convention above; on success,
    persist the R2 key on the FlightLog (not the multer temp path);
    delete the multer temp file. Add a `fileUrl` field to the
    `FlightLog` schema OR equivalent (R2 key + helper to mint
    presigned URLs — either shape is acceptable; binding constraint
    is that the parser receives a working time-limited URL). Provide
    an internal helper to mint a presigned URL on demand (used by
    `parserWorker.js` at dispatch time). Once this is DONE, signal
    that #004 backend slice is unblocked.
  - Parser: No structural action. Parser already downloads from
    `file_url` via `httpx` and does not care whether the URL is R2
    or anything else. Confirm no change.
  - Frontend: No action. Upload is multipart to the backend endpoint
    as today; the backend's downstream storage is invisible to
    frontend.
  - Seed: No action for current seed (no flight logs in the wipe-
    reseed state per #002). Future seed flight-log work, if any,
    must respect the R2 store contract — but not in scope for #005.

- Notes:
  This entry corrects the Part A baseline's claim that R2 is in
  use; that claim was based on a Session 2 report that did not
  match committed code. Future entries should treat Part A as a
  historical baseline, not an authoritative current-state
  document — repo verification was required to find this, and the
  same discipline applies elsewhere.

  Local-disk retention is explicitly NOT a fallback in this
  architecture. Once R2 is the store, the local upload path
  (multer's temp dir) is treated as ephemeral pre-PUT staging
  only — not a parallel store, not a recovery cache.

  Presigned URL TTL recommendation (1 hour) is a tunable; the
  binding constraint is that URLs are time-limited and generated
  fresh per dispatch. The numeric TTL can be adjusted via
  Notion-tracked minor change without a new entry.

---

## #006 — Reconcile `parseStatus` enum (resolves Part A drift #1)

- Date: 2026-05-22
- Status: OPEN
- Decision:
  Backend's enum is authoritative. Frontend conforms.

  Canonical `parseStatus` values:
  `pending | processing | completed | failed | skipped`

  Frontend's previous `ParseStatus` union
  (`queued | parsing | parsed | failed`) is replaced.

  Mapping for any frontend display logic that previously used the old
  values:
  - `queued`   → `pending`
  - `parsing`  → `processing`
  - `parsed`   → `completed`
  - `failed`   → `failed` (unchanged)
  - (new)      → `skipped` (for logs that bypass parsing, e.g. maintenance
                 test in future workflows; render as a neutral state)

- Rationale:
  Backend's set is more expressive (`skipped` has no frontend equivalent;
  `pending` vs `processing` distinguishes "not yet started" from "in
  flight," which the frontend collapsed into `parsing` and lost). It is
  also already what every Mongo document carries — flipping the backend
  would require a data migration AND a parser change, both of which are
  avoidable. Frontend is the cheaper side to align.

  Active impact: this drift is currently misrendering every completed
  parse in the UI. Operators see flight logs stuck on `queued`/`parsing`
  even after a successful parse, because the value the API returns
  (`completed`) is not in the frontend's union. #006 resolves this.

- Per-layer actions:
  - Backend: No change. Enum already correct.
  - Parser: No change. Parser writes the canonical values directly to
    Mongo via pymongo and is already aligned.
  - Frontend: Update the `ParseStatus` type in `src/lib/types/api.ts` to
    `'pending' | 'processing' | 'completed' | 'failed' | 'skipped'`.
    Update any conditional rendering keyed on the old values (search
    for `'queued'`, `'parsing'`, `'parsed'` across the frontend tree
    and replace per the mapping above). Verify flight list/detail
    pages render correctly for a freshly parsed log.
  - Seed: No action.

- Notes:
  Resolves Part A drift #1. Part A is append-only — do not edit it;
  this entry is the authoritative reconciliation going forward.

---

## #007 — Reconcile FlightLog field names + expose new fields (resolves Part A drift #2, extends with #005)

- Date: 2026-05-22
- Status: OPEN
- Decision:
  Backend's field names are authoritative. Frontend conforms. Backend
  additionally exposes fields that #005 introduced and that the parsed
  output requires.

  ### Canonical `FlightLog` fields the frontend type must adopt:

  | Old frontend name        | New canonical (backend) name |
  |--------------------------|------------------------------|
  | `originalFilename`       | `originalName`               |
  | `storedPath`             | `storedName`                 |
  | `fileExtension`          | (removed — derivable from `originalName`; not stored) |
  | (missing)                | `filePath`                   |
  | (missing)                | `r2Key`                      |
  | (missing)                | `parsedData` (ref to ParsedFlightData) |

  ### `parseError` shape correction:
  Backend stores `parseError: { message, stack, code }`. Frontend
  currently types it as `string` and renders it as `[object Object]`.
  Frontend must type it as an object with at minimum `message`, and
  render `parseError.message` (never the whole object).

  ### Telemetry / events / alerts location:
  Backend's authoritative location for `telemetry`, `events`, `alerts`,
  `flightModes`, `summary`, and `anomalyScore` is on the
  **`ParsedFlightData`** document, NOT on `FlightLog`. The frontend
  currently models `telemetry`, `events`, `alerts` directly on
  `FlightLog`, which does not match the backend payload.

  Frontend type must be restructured:
  - `FlightLog` carries upload metadata, parse status, ownership,
    classification, and a `parsedData` reference/payload.
  - All flight data (telemetry, events, alerts, summary, flight path,
    anomaly score, flight modes) lives under
    `flightLog.parsedData.{...}`.

  Frontend already reads through `populate('parsedData')` from the
  backend (`flightLogController.getLog`), so the data is present in
  the response — only the type and consumers need restructuring.

  ### `summary` field-name alignment:
  Backend `ParsedFlightData.summary` uses:
  `startTime`, `endTime`, `durationSeconds`, `maxAltitude`, `maxSpeed`
  (in m/s), `totalDistance` (in metres), `anomalyScore` on the parent
  document.

  Frontend's previously-declared denormalised fields on `FlightLog`
  (`startTime`, `durationSeconds`, `maxAltitudeMeters`, `maxSpeedMps`,
  `totalDistanceKm`, `anomalyScore`, `alertCount`) are removed from the
  `FlightLog` type. Display surfaces read from `flightLog.parsedData.summary`
  and convert units at the display layer (e.g. `totalDistance / 1000`
  for km).

- Rationale:
  Backend names already match Mongoose schema, controllers, and the
  parser's writes; changing them would cascade across all three layers
  for no benefit. Frontend is the cheaper side to align. The
  `parsedData` restructure removes a long-standing fiction in the
  frontend type (it pretended telemetry lived on `FlightLog`) and
  matches what the API actually returns.

  Drift is not currently rendering blank fields only because frontend
  consumers tend to guard with `?? '—'` and optional chains, masking
  the mismatch. Once any consumer assumes the old field names exist,
  it silently shows nothing. This resolves it cleanly.

- Per-layer actions:
  - Backend: No change. Already canonical. The `getLog` controller
    already populates `parsedData`; confirm `getLogs` (list endpoint)
    also populates or selects `parsedData.summary` + `anomalyScore`
    if the list view renders those fields — if so, add the projection;
    if not, leave as-is.
  - Parser: No change. Already writes to `ParsedFlightData` at
    canonical paths.
  - Frontend: Rewrite `FlightLog` and related types in `src/lib/types/api.ts`
    to match. Restructure all flight-log consumers to read flight data
    from `flightLog.parsedData.*` rather than `flightLog.*`. Type
    `parseError` as object; render `.message`. Add `r2Key` to the type
    (read-only — never written from frontend). Convert m/s → display
    units and metres → km at the display layer, not in the type.
  - Seed: No action.

- Notes:
  Resolves Part A drift #2 and the #005 extension (`r2Key` not in
  frontend type). The unit conversion expectation is documented here
  so future contributors don't recreate denormalised fields on the
  type "for convenience."

---

## #008 — Standardise API response envelope

- Date: 2026-05-22
- Status: OPEN
- Decision:
  Single canonical response envelope across all backend routes:

  ```
  {
    "success": <boolean>,
    "data":    <payload | null>,
    "message": <string — human-readable status; NOT a payload container>,
    "meta":    <optional — pagination, totals, etc.>,
    "error":   <optional — { code, details } on failures>
  }
  ```

  Payload always lives under `data`. `message` is a status/description
  string ONLY — never a payload container.

  Frontend simplifies: read every payload from `data.data`. Remove the
  defensive `data.data ?? data.message` pattern from all API client
  modules.

- Rationale:
  Current backend response helpers produce mixed shapes — some routes
  return the payload under `data`, others under `message`. Frontend
  guards with `data.data ?? data.message` everywhere. The defensive
  read works today but silently fails any time a new route is written
  off the wrong template. This is a contract drift waiting to break a
  future feature.

  Locking `data` as the only payload location costs a small backend
  cleanup pass and removes a class of bug entirely. `message` becomes
  what its name implies — a string for the user/log, not a payload
  carrier.

- Per-layer actions:
  - Backend: Audit response helpers (`sendSuccess`, `sendCreated`,
    `sendError`, `sendNotFound`, `sendForbidden`, etc. in
    `src/utils/response.js`) and any controllers that bypass them.
    Ensure every successful response places its payload under `data`
    and uses `message` only for a string. Identify and fix any routes
    that currently shove payloads into `message`.
  - Parser: No action. Parser does not produce HTTP responses to the
    frontend.
  - Frontend: Remove `data.data ?? data.message` fallbacks in every
    file under `src/lib/api/`. Read `data.data` directly. Update the
    `extractList` helper if it relies on the fallback.
  - Seed: No action.

- Notes:
  Audit list for backend during execution: any route file under
  `src/routes/` and controllers under `src/controllers/` — pay
  particular attention to the `auth`, `flight-logs`, `operators`,
  and `readiness` controllers since the frontend code reads
  `data.data ?? data.message` against all of these.

  Once #008 is DONE on both sides, the `extractList`/`extractRecord`
  helpers in the frontend can be simplified to assume `data.data`
  shape and the fallback path can be deleted, not just bypassed.
