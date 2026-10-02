---
id: pi-forecast
tier: 1
roles: [dm, tpm, pjm]
answers:
  - When will the remaining work be done, and how sure are we?
  - What is the probability of hitting a fixed deadline (end of PI, release date)?
  - How much does adding scope or losing a person move the date?
use_when: Any time someone asks "when?" and the team has a few weeks of throughput history. Re-run it weekly — a forecast is a living number.
avoid_when: Right after a big change to the team or process (history no longer describes the system); for a single item (use cycle-time percentiles instead).
read_with:
  - { id: throughput, why: "The only input besides remaining scope; its stability decides how trustworthy the forecast is." }
  - { id: program-scope-growth, why: "Scope that grows while you forecast makes every date too early." }
  - { id: forecast-accuracy, why: "Check that past 85 % forecasts came true about 85 % of the time." }
  - { id: overdue-dependencies, why: "At program level the date is set by the slowest team and its dependencies." }
calculator: monte-carlo
sources: [vacanti-wwibd, magennis-sampling, expedia-monte-carlo]
flags: []
---

## Why it exists
"When will it be done?" is the question delivery managers are asked most. A single date is always wrong; Monte Carlo simulation gives a **range with probabilities** — "50 % by 6 November, 85 % by 11 November" — built from the team's own recent throughput instead of from estimates.

## How it's calculated
1. Take recent **weekly throughput** (items finished per week), e.g. the last 8–12 weeks.
2. Count the **remaining items**.
3. One trial: for each future week, pick a random week from history and subtract its throughput from the remaining items, until nothing is left. Record how many weeks it took.
4. Run 10 000 trials. The results form a distribution of possible finish dates.
5. Read percentiles: P50 = coin flip, **P85 = the usual commitment level**, P95 = conservative.

**Worked example.** Weekly throughput history: 3, 5, 4, 6, 2, 5, 4, 7. Remaining: 20 items. 10 000 trials give:
- done in ≤ 4 weeks in about 31 % of trials,
- ≤ 5 weeks in about 81 %,
- ≤ 6 weeks in about 98 %.
So: **P50 = 5 weeks, P85 = 6 weeks**. (Exact convolution: 31.2 %, 81.2 %, 98.0 %.) Telling a stakeholder "most likely 5 weeks, 6 to be safe" is honest; "4 weeks" has about a one-in-three chance.

**Deadline probability** is the same simulation read the other way: the share of trials that finish on or before the deadline.

**At program level** (Delivery Pulse) each team is simulated with its own throughput and its own remaining committed scope; the PI is done when the **last** team is done. Pooling all teams' throughput would wrongly assume anyone can take anyone's work and inflates the probability. Only committed PI objectives are forecast; stretch (uncommitted) objectives are excluded.

## How to read it
- The **gap between P50 and P85** is your uncertainty. A widening gap means throughput became less stable.
- A falling deadline probability week after week is a leading signal — act (cut scope, remove blockers, protect capacity) while there is still time.
- If scope keeps growing, the forecast date will keep slipping even with stable throughput; forecast with a growth factor or re-baseline.

## When to use it — and when not to
Use it whenever the system is reasonably stable: same team, same workflow, similar work. It needs no estimates, only counts — so items should be **right-sized** (split big ones) rather than estimated.
Do not use it right after a reorg or a process change, or when history is very short. As Magennis notes, with 45 samples there is about a 96 % chance the next week falls inside the range already seen; with very few samples, the range you have seen is too narrow.

## How it gets gamed
- Counting tiny items to inflate throughput (then remaining items are larger than the history suggests).
- Forecasting only the "happy" scope and ignoring discovered work.
- Quoting P50 as if it were a promise.
The cure: keep item sizes consistent, include scope growth, and publish the percentile you are quoting.

## Say it in an interview
"I don't give single dates. I run a Monte Carlo on our recent throughput and say: 'Fifty percent by the 6th, eighty-five by the 11th.' If the business needs a fixed date, I turn it around and give the probability of hitting it, then we talk about scope. At program level I simulate per team and take the last one to finish — pooling throughput overstates the odds."
