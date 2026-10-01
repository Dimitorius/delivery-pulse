---
id: review-bottleneck
name: Work gets stuck in review, QA or waiting
group: Flow
scenario: review-bottleneck
# What a user sees first. Shown on the Diagnose card.
sounds_like:
  - '"It''s done, it''s just waiting for review."'
  - '"Everything is in QA."'
  - '"We start a lot but the board doesn''t move to the right."'
# Metrics that move first (leading) and the ones that confirm later (lagging). Order = display order.
early_signals:
  - { id: queue-size-by-stage, look_for: "Review / QA columns grow week over week while In Progress stays flat." }
  - { id: pr-pickup-time, look_for: "P50 climbs above the team target (4 h) — PRs wait for a first look." }
  - { id: aging-wip, look_for: "Aging items cluster in review or QA statuses, not in development." }
confirming_signals:
  - { id: flow-efficiency, look_for: "Drops: more of each item's life is waiting." }
  - { id: cycle-time, look_for: "P85 rises first, then P50; the scatterplot shows a growing upper cloud." }
  - { id: time-to-merge, look_for: "Rises together with pickup time." }
# Competing explanations and the one check that tells them apart.
hypotheses:
  - { cause: "Reviews are nobody's job — everyone prefers starting new work.", check: "WIP per person rises while PR pickup time rises (people start instead of finish)." }
  - { cause: "Pull requests are too big to review quickly.", check: "PR size (P85) trending up; time to merge grows faster for large PRs." }
  - { cause: "Review or QA capacity sits with one or two people.", check: "Review load balance concentrated; queue grows when those people are away." }
  - { cause: "QA is a separate hand-off stage at the end.", check: "Queue sits specifically in 'Ready for QA'; flaky or slow test pipeline (Pipeline P95) adds wait." }
playbook:
  now:
    - "Stop starting, start finishing: before anyone pulls a new item, the team swarms on the oldest item in review or QA."
    - "Put an explicit WIP limit on the review and QA columns; when full, developers review instead of starting."
    - "Agree a review service level the team can see (e.g. first response within the same half-day)."
  next_sprints:
    - "Make PRs small: split work so most changes are a few dozen lines, reviewable in minutes."
    - "Spread review and test skills: pair reviews, rotate the reviewer role, let developers run the regression suite."
    - "Shift testing left: automate the regression checks that make QA a queue."
  watch_after: "Queue size by stage and PR pickup time should fall within 1–2 weeks; cycle time P85 follows within a month."
anti_patterns:
  - "Adding a 'review deadline' KPI per developer — it rewards rubber-stamp approvals."
  - "Hiring more QA without changing the hand-off — the queue moves, it doesn't disappear."
  - "Raising WIP limits to make the board look less blocked."
evidence:
  - claim: "In DORA's 2023 research, teams with faster code reviews had about 50 % higher software delivery performance."
    sources: [dora-2023, getdx-dora-2023]
    note: "Correlation from survey research, not a controlled experiment — say 'associated with', not 'caused'."
  - claim: "At Google, the median wait for first feedback on a small change is under an hour, the whole review under 4 hours, and the median change modifies 24 lines."
    sources: [google-code-review-2018]
  - claim: "Limiting WIP and managing work item age are core practices for flow."
    sources: [kanban-guide-2025, vacanti-aamp]
flags: []
---

## What is going on
Work is not slow because people are slow: it is **waiting**. Each item spends most of its life in a queue — for a reviewer, a tester, an environment. Starting new work feels productive, so the queues grow, and Little's Law does the rest: more items in progress at the same throughput means every item takes longer.

## How it shows up in Delivery Pulse
Inject the scenario **Review bottleneck** on the Pulse screen and watch: *Queue size by stage* and *PR pickup time* turn first (Leading column), *Aging WIP* fills with review/QA items, and only after a week or two *Cycle time P85* and *Flow efficiency* move. That gap is the point — leading signals give you time to act before dates slip.

## Say it in an interview
"When cycle time goes up, I first check where items wait. If review and QA queues grow while development doesn't, the fix isn't pushing people harder — it's a WIP limit on those columns, smaller PRs and swarming on the oldest item. DORA's research links faster code review with much better delivery performance, and you see the effect in queue size within a week or two."
