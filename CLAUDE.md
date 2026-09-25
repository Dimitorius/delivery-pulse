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
- `npm run calibrate` — print every metric over the simulated history
- `npm run baseline` — tile statuses at the end of the history and day by day through the live PI 4

## Current stage
Stages 0–2 done (live at https://dimitorius.github.io/delivery-pulse/). Summaries and decisions: `docs/stage-1.md`, `docs/stage-2.md`. Next: stage 3 — catalog ~180, synthetic, Library, symptoms (Diagnose), scenarios (Inject), Learn; Tour. See SPEC §11.

## Code map
- `src/domain/` — canonical entities, event log types, projection store (metrics read only this).
- `src/sim/` — seeded discrete-event simulator (`profile.ts` = elite calibration knobs), calendar, Web Worker.
- `src/metrics/` — compute functions (`defs/`), stats (nearest-rank percentiles), XmR, targets; reference tests in `reference.test.ts`.
- `registry/metrics/*.yaml` — metric metadata (source of truth), `registry/sources.yaml` — shared sources.
- `src/app/` — Pulse data layer, Zustand state, hash routes (`route.ts`), framework lens (`lens.ts`), hysteresis; `src/ui/` — React components (ECharts via `EChart.tsx`): `TabPage`/`TabCharts` per tab, `MetricPage` (full metric page).
- Registry fields: `tab`, `pulse` (on the Pulse screen), `windowDays`, `minSample`, `synthetic`, `related`, `aka` (lens: ≡/≈, ≈ needs a ⚠ flag), `changelog`.
- Adding a metric = YAML + compute in `defs/index.ts` + `describe('metric:<id>')` reference test (registry test enforces all three).
- After changing `src/sim/profile.ts` run `npm run calibrate`, `npm run baseline` and `npm test` (calibration bands + elite baseline test).
- The simulator is chaotic: any change to the order or number of RNG draws reshuffles the whole history. New subsystems must draw from their own `Rng` stream (seeded from the main seed) so the curated history (seed 167, picked by `scripts/seed-search.ts` against all 50 metrics) stays put. If the main stream must change, re-run the seed search.
- Status rules (review 25.09): `minSample` → low confidence (not coloured); range targets (Say/Do 80–90 %); hysteresis (3 updates) in `src/app/hysteresis.ts`; Signals = XmR + off-target tiles, Watch items = aging items + overdue deps.
