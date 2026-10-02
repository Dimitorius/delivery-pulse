---
id: cycle-time
tier: 1
roles: [dm, tpm, pjm]
answers:
  - Once we start something, how long does it usually take to finish?
  - What can we promise a stakeholder for a single item ("85 % of items finish within N days")?
  - Is our process getting faster, slower, or less predictable?
use_when: Always for any team that pulls work through a board — Scrum or Kanban. It is the first number to look at when someone says "we've become slow".
avoid_when: Comparing teams with different workflows or different start/finish points; judging individuals.
read_with:
  - { id: wip, why: "Little's Law — more WIP at the same throughput means longer cycle time." }
  - { id: throughput, why: "Speed of one item vs rate of the system; read both before acting." }
  - { id: aging-wip, why: "Cycle time only sees finished items; Work Item Age warns about the ones still running." }
  - { id: flow-efficiency, why: "Tells whether long cycle time is work or waiting." }
calculator: cycle-percentiles
sources: [kanban-guide-2025, vacanti-aamp, vacanti-wwibd, littles-law, planview-flow-time]
flags:
  - "⚠ Practitioner heuristic: the 'P85 / P50 above ~3' rule of thumb (tail-ratio idea) is not a published threshold."
---

## Why it exists
Cycle time is the customer-facing speed of a team's process: the elapsed time from when an item was **started** to when it was **finished**. It answers the question stakeholders actually ask — "if you start this today, when will it be done?" — and it is one of the four flow measures the Kanban Guide requires (with WIP, Throughput and Work Item Age).

## How it's calculated
`cycle time = finished − started`, per item, in calendar days (weekends included, as in most trackers).

What counts as "started" and "finished" is a team decision written into its workflow definition. In Delivery Pulse: started = first move to *In Progress*; finished = *Done*.

Report it as **percentiles**, never as an average: cycle times are right-skewed with a long tail, so the mean is dragged up by a few outliers and describes no real item.

**Worked example.** Ten items finished last month took 1, 2, 2, 3, 3, 4, 5, 6, 9 and 21 days.
- P50 (median) = the 5th value of 10 = **3 days**
- P85 = the ⌈0.85 × 10⌉ = 9th value = **9 days**
- The mean is 5.6 days — higher than 7 of the 10 items, because of the single 21-day item.

So the honest promise is "half our items finish within 3 days, 85 % within 9".

## How to read it
- Look at the **scatterplot** first, then the percentile lines. One dot at 21 days is a story; a cloud drifting upward is a trend.
- A rising **P85 with a stable P50** means the tail is getting fatter: a few items get stuck (blocked, waiting on another team, too big). Look at Aging WIP and Blocked items.
- A rising **P50** means the whole system slowed down — usually too much WIP or a bottleneck stage (see Queue size by stage).
- A large **P85 / P50** ratio (roughly 3+ ⚠) points to an unpredictable process even if the median looks fine.

## When to use it — and when not to
Use it for every team, every week. It is the basis for the team's Service Level Expectation (SLE).
Do not compare teams with it unless they share the same start and finish points and similar work types; do not set it as an individual target.

## How it gets gamed
- Moving the "started" point later (work happens in *To Do*, the clock starts only at the end).
- Splitting items artificially small just before finishing, or closing items as Done and reopening follow-ups.
- Excluding "special" items from the sample.
The cure: agree start/finish points in the workflow definition and watch Throughput and Defect reopen rate alongside.

## Say it in an interview
"I report cycle time as percentiles — for example, '85 % of our items finish within 9 days' — never as an average, because the distribution has a long tail. I read it together with WIP and Work Item Age: cycle time tells me about the past, age tells me which items are about to become late."

## Framework names
Flow Framework calls a close relative **Flow Time** ≈: it also starts at the first active state, but stops when the item is available to the customer, not at Done.
