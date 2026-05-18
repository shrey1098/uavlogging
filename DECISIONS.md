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
