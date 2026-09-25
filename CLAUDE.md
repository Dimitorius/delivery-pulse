# Delivery Pulse — working notes for Claude

Read `docs/SPEC.md` first: it is the approved product spec (all decisions from the design grilling, 25.09.2026). Do not re-open settled decisions without the owner asking.

## Owner
Dmitry — Senior Delivery Manager / TPM, not a programmer. Explain git/GitHub steps plainly and only when needed. Conversation in Russian; product UI and code in English.

## Non-negotiables
- Transparency over beauty: every number must be traceable (click → formula, source events, target, benchmark + source).
- Not overloaded: few tiles per screen, details on click.
- Every metric is computed from simulator events, never generated as a ready series (except items explicitly marked SYNTHETIC).
- Percentiles/median, never plain averages for time metrics. Keep the fat tail in simulated data.
- Every live metric has a Vitest reference test with a hand-computed expected value.
- No per-person dashboards (individual metrics exist only as catalog anti-metrics).
- Content: ≥2 independent English primary sources per claim, prefer 2023+; flag disputed/single-source claims with ⚠ for Dmitry's final call.

## Stack
React + TypeScript + Vite, ECharts, Zustand, simulator in a Web Worker, Vitest. Deployed to https://dimitorius.github.io/delivery-pulse/ by `.github/workflows/deploy.yml` on push to `main`. Vite `base` is `/delivery-pulse/`.

## Commands
- `npm ci` — install
- `npm run dev` — local dev server
- `npm test` — tests
- `npm run build` — production build (must pass before pushing)

## Current stage
Stage 0 done (deploy pipeline, live at https://dimitorius.github.io/delivery-pulse/). In progress: stage 1 — event model, seeded simulator, ~15 metrics, Pulse screen. See SPEC §11.
