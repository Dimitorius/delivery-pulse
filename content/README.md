# content/ — catalog and Learn articles

Written in Cowork (research + text), reviewed by Dmitry. Claude Code does **not** edit these files by hand; in stage 3 it builds the Catalog, Library and Learn screens from them.

## Files
- `catalog.yaml` — every metric in the product (~170): id, name, domain, levels, source, tier, status, one-line question, framework aliases. See the header of the file for field meanings.
- `articles/<id>.md` — one Learn article per metric. YAML front matter + fixed `##` sections.
- `sources.yaml` — sources used here that are not yet in `registry/sources.yaml` (merge by key; the `vacanti-wwibd` entry here corrects the year to 2020).
- `symptoms/` — Diagnose symptoms and playbooks (later batch).

## How it joins the registry
`id` is the join key. For `status: live` the numbers (formula, target, benchmark, xmr) stay in `registry/metrics/<id>.yaml`; the catalog adds tier, aliases and the Learn article. For every other status the catalog entry *is* the metadata, and the tile shows a `SYNTHETIC` badge (featured ones get good-quality synthetic series on their tab).
If a live metric's id in the registry differs from the catalog, the registry wins — rename the catalog entry and the article file.

## Article front matter
| field | meaning |
|---|---|
| `tier` | 1 Start here · 2 Core · 3 Situational · 4 Specialist |
| `roles` | reading paths: `dm` Delivery Manager, `tpm` Technical Program Manager, `pjm` Project Manager |
| `answers` | the questions this metric answers (shown as bullets at the top) |
| `use_when` / `avoid_when` | one-paragraph guidance |
| `read_with` | bundle: related metric ids with the reason to read them together |
| `calculator` | id of the interactive calculator (Tier 1 only) or absent |
| `sources` | keys into sources.yaml / registry/sources.yaml — rendered as clickable links |
| `flags` | ⚠ items still waiting for Dmitry's decision; empty list = cleared |

## Article sections (always in this order)
`Why it exists` · `How it's calculated` (with a worked example) · `How to read it` · `When to use it — and when not to` · `How it gets gamed` · `Say it in an interview` · optional `Framework names` / `Primary source quotes`.
The metric card (side panel) shows `answers`, the first paragraph of *Why it exists*, the formula line and *Say it in an interview*; the Learn page shows everything.

## Research rules (SPEC §10)
≥ 2 independent English sources per substantive claim, primary sources first (DORA, Scrum Guide, Kanban Guide, SAFe, Vacanti, Magennis, Google SRE, getdx research, PMI), 2023+ where the topic moves. Anything single-source, disputed or a practitioner heuristic gets a `⚠` flag until Dmitry decides.

## Symptoms (Diagnose)
- `symptoms/index.yaml` — all 42 symptoms: id, group, display name, simulator `scenario` id (or null).
- `symptoms/<id>.md` — one file per symptom (written in batches; missing file → card shows "playbook coming").
Front matter: `sounds_like` (what people say), `early_signals` / `confirming_signals` (metric id + what to look for — these drive the "anamnesis" bundle on screen), `hypotheses` (cause + the one check that separates it), `playbook` (`now`, `next_sprints`, `watch_after`), `anti_patterns`, `evidence` (claim + source keys + optional note), `flags`.
Body sections: `What is going on` · `How it shows up in Delivery Pulse` · `Say it in an interview`.
