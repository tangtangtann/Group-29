# TriageFlow — Setup & Team Guide

## 1. Prerequisites

- **Node.js 20+** — install from https://nodejs.org (the dev machine currently has no Node; install this first).
- An **AWS account** with **Amazon Bedrock model access** enabled for a Claude model (for the real AI; the app also runs without it using a rule-based fallback).

## 2. Run it

```bash
npm install
cp .env.example .env.local   # optional: add AWS creds for real Bedrock
npm run dev                  # http://localhost:3000
```

Click **Simulate surge** → **Rebalance with AI** → **Approve** some transfers → **Dispatch**.

> Without AWS credentials the app uses a deterministic rule-based planner so the UI is fully demoable. Add credentials to `.env.local` to switch to real Amazon Bedrock reasoning (the panel shows which one ran).

## 3. The shared contract

`src/lib/types.ts` is the single source of truth between backend and frontend.
Change it together — it defines every hospital, patient, and API shape.

## 4. Who owns what

| Area | Files | Owner |
|---|---|---|
| Bedrock / AI reasoning | `src/lib/bedrock.ts`, `src/app/api/recommend/route.ts` | **Siddharth** |
| Data, state & surge | `src/lib/seed.ts`, `src/lib/mockPlanner.ts`, `src/app/api/state/route.ts`, `src/app/api/dispatch/route.ts` | **Reshma** |
| Region map | `src/components/RegionMap.tsx` | **Nicole** |
| AI panel & dashboard | `src/components/PlanPanel.tsx`, `src/app/page.tsx` | **Vatey** |

## 5. API quick reference

- `GET  /api/state?surge=1` → `{ incident, hospitals, patients }`
- `POST /api/recommend` body `{ hospitals, patients, overrides? }` → `{ transfers, equityFlags, summary, usedBedrock }`
- `POST /api/dispatch` body `{ hospitals, patients, transfers }` → `{ hospitals, patients, maxLoadPercent, unplacedCount }`

## 6. Suggested parallel workflow

1. Everyone pulls; confirm `src/lib/types.ts` and `src/lib/seed.ts` as the contract.
2. Frontend builds against the seed data + mock planner immediately (no AWS needed).
3. Siddharth tunes the Bedrock prompt in `src/lib/bedrock.ts` and tests with real creds.
4. Integrate, run the full surge → rebalance → dispatch flow, record the demo.

## 7. Deploying to AWS Amplify

One-time setup, from a terminal that has AWS credentials and the AWS CLI:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-amplify.ps1
```

Run it in the terminal where you set the `$Env:AWS_...` credentials. It creates an Amplify app that builds `main` on every push and passes those **temporary** credentials to the hosted app so it can call Bedrock (the workshop account can't create IAM roles). It prompts for a GitHub personal access token (used once, not stored) and an optional site password. After that, deploying is just `git push`.

When the workshop session expires, the hosted badge shows "Rule-based fallback". Get fresh credentials, set them in a terminal, and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-creds.ps1
```

Tear down: `aws amplify delete-app --region us-east-1 --app-id <id>`.

## 8. Bedrock notes (Siddharth)

- Uses the Bedrock Runtime **`Converse`** API via `@aws-sdk/client-bedrock-runtime`.
- Model id is set by `BEDROCK_MODEL_ID`. Make sure that exact model is **enabled** in the Bedrock console for your `AWS_REGION`.
- The prompt forces strict-JSON output; `extractJson()` tolerates code fences. If the model drifts, tighten `SYSTEM_PROMPT` or lower `temperature`.
