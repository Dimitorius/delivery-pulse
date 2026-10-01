---
id: say-do-ratio
tier: 1
roles: [dm, pjm]
answers:
  - Does the team finish what it plans at sprint planning?
  - Are we over-committing, or playing it too safe?
  - Can stakeholders rely on a sprint plan?
use_when: Scrum teams with a stable sprint cadence, reviewed once per sprint together with Sprint Goal success and carry-over.
avoid_when: Kanban teams (no sprint commitment); as a performance target for the team; comparing teams.
read_with:
  - { id: sprint-goal-success, why: "The Scrum Guide's commitment is the Sprint Goal, not every item — goal success matters more than the ratio." }
  - { id: carry-over, why: "The other side of the same coin: what did not finish and why." }
  - { id: sprint-scope-change, why: "Items added mid-sprint push committed items out; a low ratio can be an interruption problem." }
  - { id: unplanned-work, why: "Distinguishes over-commitment from a flood of urgent work." }
calculator: say-do
sources: [scrum-guide-2020]
flags:
  - "⚠ No research-based benchmark. 80–90 % is a practitioner convention; the only primary source (Scrum Guide) frames sprint work as a forecast."
---

## Why it exists
Say/Do (also called *commitment reliability*) shows how much of the work a team planned at sprint planning it actually finished by the end of the sprint. It is a cheap, once-per-sprint check of **planning realism**: are plans something the rest of the organisation can build on?

## How it's calculated
`Say/Do = points (or items) of the planned sprint scope that are Done at sprint end ÷ points (or items) planned at sprint planning × 100 %`

Only the scope fixed at planning counts. Work added mid-sprint is excluded from both sides — it is tracked by Sprint scope change.

**Worked example.** At planning the team selects 40 points. During the sprint the PO adds a 6-point urgent item, which is finished. At the end, 34 of the original 40 points are Done.
Say/Do = 34 ÷ 40 = **85 %**. The extra 6 points do not raise the ratio — they explain why it is not 100 %.

## How to read it
- **80–90 %** — a healthy corridor: plans are realistic and still ambitious.
- **Consistently above ~95 %** — suspicious rather than excellent. It usually means the team plans conservatively (sandbagging), because the ratio is being watched.
- **Below ~70 %** — over-commitment, items too large to finish in a sprint, or unplanned work crowding the plan. Check Sprint scope change and Unplanned work share before blaming estimates.
- Read the trend over 3+ sprints; a single sprint says little.

## When to use it — and when not to
Useful for Scrum teams that commit to a sprint plan and whose stakeholders depend on it. Keep it a team's private planning signal.
Do not make it a target: the Scrum Guide (2020) calls the selected work a **forecast** and makes the **Sprint Goal** the commitment. A team that finishes the goal at 75 % Say/Do has done its job; one that hits 100 % but misses the goal has not.

## How it gets gamed
- Planning less than the team can do (the most common).
- Moving unfinished items out of the sprint just before it closes.
- Marking items Done that do not meet the Definition of Done.
The cure: never tie it to performance reviews; pair it with Sprint Goal success and DoD compliance.

## Say it in an interview
"I look at Say/Do as a planning-realism signal, in a corridor of about 80–90 %, not a target. Below that, I check scope change and unplanned work before blaming estimates; consistently near 100 %, I suspect the team is under-committing. And per the Scrum Guide the real commitment is the Sprint Goal, so goal success comes first."

## Primary source quotes
- Scrum Guide 2020: "Although the Sprint Goal is a commitment by the Developers, it provides flexibility in terms of the exact work needed to achieve it."
- Scrum Guide 2020: "…the more confident they will be in their Sprint forecasts."
