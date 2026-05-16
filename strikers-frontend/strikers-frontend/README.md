# STRIKERS UAV Performance System — Frontend

**Produced by STIFF · For 17 JAK LI**

Mobile-first responsive SvelteKit application for UAV operator performance tracking and commander readiness assessment.

---

## Stack

- **SvelteKit 2** + **Svelte 5** (runes)
- **TypeScript**
- **Tailwind CSS** + **shadcn-svelte** (bits-ui)
- **TanStack Query (Svelte)** — server state
- **LayerChart** — visualisations
- **Axios** — HTTP client with JWT interceptors

## Palette

JAK LI regimental flag: **Scarlet · Black · Gold**

- Scarlet → primary CTAs, live ops, alerts
- Gold → readiness scores, brand, highlights
- Black → base

## Setup

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env if backend runs on a different port

# 3. Start backend (separate terminal)
# cd ../drone-backend && npm run dev

# 4. Start frontend
npm run dev
# → http://localhost:5173
```

## Test Credentials (from backend seed)

| Email                       | Password      | Role        |
| --------------------------- | ------------- | ----------- |
| admin@dronedebrief.dev      | Admin1234!    | super_admin |
| operator@dronedebrief.dev   | Operator1234! | operator    |

## Project Structure

```
src/
├── lib/
│   ├── api/              # Axios client, query hooks
│   ├── components/
│   │   ├── ui/           # shadcn-svelte primitives
│   │   ├── layout/       # App shell, navigation
│   │   ├── charts/       # LayerChart wrappers
│   │   ├── operator/     # Operator-specific components
│   │   └── commander/    # Commander-specific components
│   ├── stores/           # Svelte stores (auth, theme)
│   ├── types/            # TypeScript types matching backend
│   ├── utils/            # Helpers (cn, format, etc.)
│   └── styles/           # Global CSS
└── routes/
    ├── (auth)/           # Public routes (login)
    └── (app)/            # Authenticated routes
        ├── operator/     # Operator screens (mobile-first)
        └── commander/    # Commander screens (desktop-first)
```

## Build

```bash
npm run build
npm run preview
```

## Backend Contract

API base: `http://localhost:5000`
Auth: JWT Bearer access token + httpOnly refresh cookie
CORS: Pre-configured for `http://localhost:5173`

See backend Notion docs for full API reference.
