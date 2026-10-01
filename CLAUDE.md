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
- `npm run baseline` — tile statuses at the end of the history, then the PI forecast per live PI 4–14 (committed start/min, with-stretch start) and live tile checks
- `npm run seed-search -- <from> <count>` — find seeds that pass the elite baseline (history end + every live PI 4–14 + a lively stretch number). **Run it after every simulator change that alters RNG draws** (order or number), then set `DEFAULT_SEED` in `src/sim/simulator.ts`; ~15–20 min per 50 seeds, so run 4 ranges in parallel (e.g. `1 50`, `51 50`, `101 50`, `151 50`) and pick a ✅ line

## Current stage
Stages 0–2 done (summaries and decisions: `docs/stage-1.md`, `docs/stage-2.md`, sections «Решения Дмитрия»). PI forecast = two numbers: committed objectives (target ≥ 85 %, coloured, ~96–99 %, shown "> 99 %" above 99) and committed + stretch (neutral, no target, ~60–85 %). The live tail stops at the end of PI 14 (`HORIZON_W`). Stage 3a done 01.10.2026 (screens only, simulator untouched): Catalog, Library, SYNTHETIC series, Learn, Diagnose, SAFe flow metrics on Scale, sources merged — `docs/stage-3a.md` (open ⚠ for Dmitry there). Next: stage 3b — scenarios (Inject scenario), Tour; see SPEC §11. Do not start it until the owner says so.

**Stage 3 content comes from `content/`**, prepared by Cowork: `content/catalog.yaml`, `content/articles/`, `content/sources.yaml`, `content/README.md`. All catalog and Learn content is taken from these files — never invent content; build the screens from them. If something is missing or contradictory, ask Dmitry instead of filling the gap.

## Code map
- `src/domain/` — canonical entities, event log types, projection store (metrics read only this).
- `src/sim/` — seeded discrete-event simulator (`profile.ts` = elite calibration knobs), calendar, Web Worker.
- `src/metrics/` — compute functions (`defs/`), stats (nearest-rank percentiles), XmR, targets; reference tests in `reference.test.ts`.
- `registry/metrics/*.yaml` — metric metadata (source of truth), `registry/sources.yaml` — shared sources.
- `src/app/` — Pulse data layer, Zustand state, hash routes (`route.ts`), framework lens (`lens.ts`), hysteresis, Library (`library.ts`: IndexedDB overrides + JSON export/import), `safeFlow.ts` (six SAFe flow metrics = registry metrics named by `aka.safe`); `src/ui/` — React components (ECharts via `EChart.tsx`): `TabPage`/`TabCharts` per tab, `ViewCharts` (catalog views), `MetricPage` (live metric), `CatalogMetricPage` (synthetic/view/anti), `CatalogPage`, `LibraryPage`, `LearnPage` (+ `Calculators`), `DiagnosePage`.
- `src/content/` — reads `content/` (catalog, articles, symptoms; a small Markdown subset, no raw HTML) and joins it with the registry by id. Catalog ids that differ from registry ids are mapped in `CATALOG_TO_REGISTRY` (registry wins; content files are not edited). Calculator logic in `calculators.ts`, tested against the articles' worked examples.
- `src/synthetic/` — SYNTHETIC series for catalog metrics the simulator does not produce: `specs.ts` (illustrative ranges, never targets), `series.ts` (own `Rng` stream per metric × team, seeded from the main seed via FNV — never draws from the simulator). Every synthetic/featured catalog entry without a registry def must have a spec (test). Anti-metrics are never tiles.
- Registry fields: `tab`, `pulse` (on the Pulse screen), `windowDays`, `minSample`, `synthetic`, `related`, `aka` (lens vocabulary: ≡/≈, ≈ needs a note plus `verified: <date>` or a ⚠ flag), `lensConflict` (the only thing that dims a tile in a lens — lens is a vocabulary, not a filter), `changelog`.
- Adding a metric = YAML + compute in `defs/index.ts` + `describe('metric:<id>')` reference test (registry test enforces all three). A catalog entry with `status: live` but no registry def shows as "not computed yet" (`isPendingLive`); the list is pinned in `src/content/content.test.ts`.
- After changing `src/sim/profile.ts` run `npm run calibrate`, `npm run baseline` and `npm test` (calibration bands + elite baseline test + `src/app/liveBaseline.test.ts`, which walks the live PI 4–14 at a 4-working-hour step: forecast ≥ 86 %, no red Pulse tile).
- The simulator is chaotic: any change to the order or number of RNG draws reshuffles the whole history. New subsystems must draw from their own `Rng` stream (seeded from the main seed) so the curated history (seed 83, picked by `scripts/seed-search.ts` against all metrics and every live PI 4–14) stays put. If the main stream must change, re-run the seed search (`npm run seed-search`).
- Status rules (review 25.09, 30.09): `minSample` → low confidence (not coloured); status judged on the displayed (rounded) value; range targets (Say/Do 80–90 %); hysteresis in `src/app/hysteresis.ts` = 3 hourly sim ticks (`StatusBook`, pure function of sim time — same at any speed; unconfirmed change shown as "confirming n/3" / "recovering"). Metrics must read only events ≤ asOf (`src/metrics/asof.test.ts`); `doneAt` = first completion; Signals = XmR + off-target tiles, Watch items = aging items + overdue deps.
- PI rhythm: 4 dev iterations + 1 IP; PI Planning for the next PI runs inside the IP iteration (`piPlanningLeadHours` before the PI start), creating stories, objectives (4–6 per team) and dependencies in advance.
- Simulator planning safeguards (review 30.09): tech debt is a per-sprint budget (carried debt counts, extra goes back to `debtBacklog`); Platform plans last and counts the enablers it owes; PI load check `piStoryLoad` (stories ≤ 80 % of median stories/sprint × 4); daily focus mode when behind the PI commitment; external blockers escalate after 8 working days.
