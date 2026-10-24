# AGENTS.md — LifeLine

Guidance for AI coding agents (and humans) working in this repo. Read this before making changes.

---

## 1. What this project is

**LifeLine** is an AI-powered Medical Operations Coordination Center (MOCC). During a hospital surge, some facilities go over capacity while others nearby still have beds. LifeLine shows a live regional picture and uses **Amazon Bedrock (Claude)** to recommend which patients to transfer where, with a plain-language rationale and equity flags. A human coordinator approves/overrides, then dispatches.

Core loop: **Simulate surge → Rebalance with AI → Approve/Override → Dispatch → region rebalances.**

This is a hackathon build. Prioritize a working, demoable end-to-end flow over completeness.

---

## 2. Tech stack

- **Next.js 14** (App Router) — UI and API routes in one app.
- **TypeScript**, strict mode.
- **Tailwind CSS** for styling.
- **@aws-sdk/client-bedrock-runtime** — calls Claude via the Bedrock `Converse` API.
- Data is **seeded JSON / in-memory** — there is no database. Do not add one unless asked.

Node.js 20+ is required. Package manager: npm.

---

## 3. Commands

```bash
npm install        # install deps
npm run dev        # dev server at http://localhost:3000
npm run build      # production build — RUN THIS to verify changes compile
npm run start      # serve the production build
npm run lint       # next lint
```

After any code change, run `npm run build` to confirm it compiles before declaring done. There is no test suite; do not add one unless asked.

---

## 4. Architecture & data flow

```
Browser (src/app/page.tsx — client component, holds all UI state)
   │  fetch
   ▼
Next.js API routes (src/app/api/*)
   ├─ GET  /api/state?surge=0|1   → seeded region snapshot
   ├─ POST /api/recommend         → AI rebalancing plan
   └─ POST /api/dispatch          → apply approved transfers, return new state
   │
   ▼
src/lib/bedrock.ts  → Amazon Bedrock (Claude)   [real AI]
   └─ falls back to src/lib/mockPlanner.ts        [rule-based, no AWS needed]
```

Key behavior: **the app is fully functional without AWS credentials.** `bedrock.ts` detects missing credentials (no `AWS_ACCESS_KEY_ID` and no `AWS_PROFILE`) and returns the deterministic `mockPlanner` result instead. The response field `usedBedrock: boolean` tells the UI which ran, and the UI shows a badge. Preserve this fallback — it keeps the demo and frontend work unblocked.

---

## 5. File map & ownership

| File | Purpose | Owner |
|---|---|---|
| `src/lib/types.ts` | **Shared contract.** All data + API shapes. | shared |
| `src/lib/seed.ts` | 8 hospitals, patients, calm + surge states. | Reshma |
| `src/lib/mockPlanner.ts` | Deterministic rebalancer (fallback + frontend mock). | Reshma |
| `src/lib/bedrock.ts` | Real Bedrock/Claude reasoning + prompt. | Siddharth |
| `src/app/api/state/route.ts` | Region snapshot endpoint. | Reshma |
| `src/app/api/recommend/route.ts` | AI plan endpoint. | Siddharth |
| `src/app/api/dispatch/route.ts` | Apply transfers, recompute load. | Reshma |
| `src/lib/geo.ts` | Real-distance transport times (haversine), shared by planner and Bedrock. | shared |
| `src/components/RegionMap.tsx` | Full-screen MapLibre map (CARTO Positron), DOM markers, animated transfer arcs. Client-only. | Nicole |
| `src/components/PlanPanel.tsx` | Recommendation cards, approve/override. | Vatey |
| `src/app/page.tsx` | Dashboard: state, controls, wiring. | Nicole & Vatey |

---

## 6. The contract — `src/lib/types.ts` (read this first)

This file is the single source of truth between backend and frontend. **Do not change a shape in isolation** — a change here ripples through the seed data, the planner, the Bedrock parser, the API routes, and both components. If you must change it, update every consumer in the same change and re-run `npm run build`.

Core types: `Hospital`, `Patient`, `TransferRecommendation`, `EquityFlag`.
API shapes: `StateResponse`, `RecommendRequest` / `RecommendResponse`, `DispatchRequest` / `DispatchResponse`.
Helpers (use these, don't recompute): `icuLoadPercent(h)`, `isOverCapacity(h)`, `loadStatus(h)` → `healthy|strained|critical`, `freeIcuBeds(h)`.

Load color rule: over capacity (`icuOccupied > icuTotal`) is critical (red); `>= 85%` including exactly 100% (full) is strained (yellow); else healthy (green). Never test "over capacity" with `icuLoadPercent(h) >= 100`. Full and overloaded must stay distinct; use `isOverCapacity`.

---

## 7. The AI contract (Bedrock)

`src/lib/bedrock.ts` sends region state to Claude and expects **strict JSON** back matching `{ transfers, equityFlags, summary }`. Rules enforced by the system prompt:

- Only move patients with `stableForTransfer: true` currently in an **over-capacity** hospital (`icuOccupied > icuTotal`; exactly full is not over).
- A receiving hospital must have free ICU beds **and** all of the patient's required `needs` (capabilities).
- Don't exceed a receiving hospital's free beds across the whole plan.
- Higher `acuity` (5 = most critical) moves first.
- **Load-aware placement:** never take a hospital's last free bed if another capable hospital has 2+; among capable hospitals within 15 min (`LOAD_WINDOW_MIN`) of the closest, pick the lowest load after the move, ties by shorter transport. Transport = `max(6, round(4 + 1.6 × km))` from `geo.ts`; Bedrock receives these as a precomputed `transportMinutes` table instead of computing distances.
- **Equity:** if an `underResourced` hospital is over capacity while better-resourced ones have room, prioritize it and emit an `EquityFlag`.
- Every transfer needs a human-readable `rationale`.

`extractJson()` tolerates markdown code fences. If the model returns prose or bad JSON, the code falls back to `mockPlanner`. Keep `temperature` low (~0.2). The mock planner implements the **same rules** deterministically — keep the two in sync when the rules change.

---

## 8. Conventions

- **Server vs client:** API routes and `src/lib/*` run server-side. `page.tsx` and both components are `"use client"`. Never import `bedrock.ts` or the AWS SDK into a client component.
- **No secrets in code.** AWS config comes from env vars only (see `.env.example`). Never commit `.env.local`.
- **Keep it demo-first.** Favor a reliable visible result over robustness the demo won't show. Don't add infra (DB, auth, queues) unless asked.
- **Styling:** Tailwind utility classes; dark theme (slate/sky palette). Match existing components.
- **Imports:** use the `@/` alias for `src/` (configured in `tsconfig.json`).
- **TypeScript is strict.** No `any` on the contract types; keep API bodies typed against `types.ts`.

---

## 9. Environment variables

See `.env.example`. None are required to run (fallback mode). For real Bedrock:

| Var | Notes |
|---|---|
| `BEDROCK_REGION` | Region for Bedrock. Falls back to `AWS_REGION`, then `AWS_DEFAULT_REGION`, then `us-east-1`. |
| `BEDROCK_MODEL_ID` | Must be an **enabled**, non-EOL model/inference profile. Default: `us.anthropic.claude-sonnet-5-5`. Change it in `bedrock.ts` and both `scripts/*.ps1`. |
| `BEDROCK_TIMEOUT_MS` | Optional, default `25000`. Bedrock calls abort after this and fall back, staying under Amplify's ~30s request limit. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | Local dev. Or set `AWS_PROFILE`. |
| `BEDROCK_ENABLED` | `true` when credentials come from an IAM role (Amplify/Lambda) with no env keys. |
| `TF_ACCESS_KEY_ID` / `TF_SECRET_ACCESS_KEY` / `TF_SESSION_TOKEN` | Hosted only. Explicit credentials for Amplify, which blocks the `AWS_` prefix. Set by `scripts/deploy-amplify.ps1`; temporary, they expire. |

The Bedrock call runs if `BEDROCK_ENABLED=true`, `TF_ACCESS_KEY_ID`, `AWS_ACCESS_KEY_ID`, or `AWS_PROFILE` is set; any Bedrock error falls back to `mockPlanner`.

### Hosting (AWS Amplify)

The workshop account can't create IAM roles, and its only passable role (`WSParticipantRole`) doesn't trust any AWS service. So the hosted app runs on the participant's **temporary** credentials, passed as `TF_*` env vars and written to `.env.production` at build time by `amplify.yml`.

- Deploy: `scripts/deploy-amplify.ps1` (one-time; then every push to `main` redeploys).
- When the session expires, the hosted badge flips to "Rule-based fallback". Run `scripts/refresh-creds.ps1` with fresh credentials.
- Never reference `TF_*` from client components. They must stay server-side.

---

## 10. Common tasks — where to look

| I want to… | Edit |
|---|---|
| Change hospitals/patients or the surge scenario | `src/lib/seed.ts` |
| Tune the AI prompt or JSON parsing | `src/lib/bedrock.ts` |
| Change transfer selection rules | `src/lib/mockPlanner.ts` **and** the prompt in `bedrock.ts` (keep in sync) |
| Change the map look / arrows | `src/components/RegionMap.tsx` |
| Change recommendation cards / override UX | `src/components/PlanPanel.tsx` |
| Change dashboard layout / buttons / state flow | `src/app/page.tsx` |
| Add/modify an API shape | `src/lib/types.ts` first, then all consumers |

---

## 11. Gotchas

- Coordinates in `seed.ts` are real Bay Area lat/lng. Hospital names are fictional; capacity is simulated.
- **Regions:** every hospital has a `regionId`. The page sends only the selected region's hospitals/patients to `/api/recommend` and `/api/dispatch`, then merges the dispatch result back into the full state.
- MapLibre v6 renders tiles in a web worker that bundlers can't find. `scripts/copy-maplibre-worker.mjs` (run by `predev`/`prebuild`) copies it to `public/maplibre/` (gitignored), and `RegionMap.tsx` calls `setWorkerUrl` at module load. A white map with markers but no streets means the worker failed to load.
- `RegionMap` uses MapLibre (WebGL, `window`), so `page.tsx` loads it with `next/dynamic` and `ssr: false`. Don't import it statically. Markers are DOM elements styled by `.tf-*` classes in `globals.css`.
- The CARTO basemap is free with attribution (shown bottom-right). Don't hide the attribution control.
- `/api/dispatch` is stateless: the client sends the current `hospitals`/`patients` snapshot and the route returns the mutated copy. There is no persistence between requests by design.
- The `mockPlanner` and the Bedrock prompt encode the **same** rules. If you change one, change the other, or the demo behaves differently with vs. without AWS.
- Over-capacity means `icuOccupied` can exceed `icuTotal` (e.g. patients in hallways). `freeIcuBeds` clamps to 0; load percent can exceed 100.
