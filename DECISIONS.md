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

_No decisions recorded yet. Mission-scope decision and others to follow
in subsequent entries._