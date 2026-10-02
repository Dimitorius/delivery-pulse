// Inject scenario (SPEC §3, stage 3b): twelve "trouble buttons", one per
// Diagnose symptom the simulator can honestly reproduce from events
// (content/symptoms/index.yaml, field `scenario`). A scenario changes how the
// simulated organisation behaves from the moment it is injected until it is
// cleared — people, queues and probabilities, never a metric. Every number
// on screen still comes from the resulting events.
//
// Without a scenario nothing here runs and no extra random numbers are drawn,
// so the curated history (seed 83) stays exactly as it is.

import type { Profile } from './profile'

type NumericKeys = { [K in keyof Profile]: Profile[K] extends number ? K : never }[keyof Profile]

export interface SignalRef {
  id: string
  /** Direction that means "worse" when the registry metric is neutral or the symptom reads it the other way. */
  worse?: 'up' | 'down'
}

export interface ScenarioDef {
  id: string
  /** Short label for the event log and the banner. */
  label: string
  /** What the simulator changes, in one or two plain sentences (shown on screen). */
  mechanics: string
  /** Profile parameters multiplied by a factor while active. */
  scale?: Partial<Record<NumericKeys, number>>
  /** Profile parameters set to a value while active. */
  set?: Partial<Record<NumericKeys, number>>
  /** Each developer works on this many items at once (extra parallel work slots). */
  slotsPerDev?: number
  /** A started item turns out much bigger than estimated: chance, and the median of the extra working hours (lognormal). */
  stuck?: { prob: number; extraHours: number }
  /** Per Scrum team per day: chance a new story is discovered in a committed feature and added to the running sprint. */
  discoverPerDay?: number
  /** Per Scrum team per day: chance a not-started committed story is swapped for a new "top priority" story. */
  reprioritizePerDay?: number
  /** Platform puts the enablers other teams wait for behind its own work; new mid-PI dependencies appear. */
  platformBusy?: { newDepPerDay: number; needByHours: number }
  /**
   * Signals used when the symptom has no content file yet (content/symptoms/<id>.md
   * wins when it exists). Early = should move first, confirming = later.
   */
  early: SignalRef[]
  confirming: SignalRef[]
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'missed-dates',
    label: 'Missed dates',
    mechanics: 'People are pulled into other work: every developer has about 40 % less focus time and longer gaps between tasks. The plan stays the same.',
    scale: { focus: 0.6, devGapMedian: 1.5 },
    early: [{ id: 'pi-forecast' }, { id: 'aging-wip' }],
    confirming: [{ id: 'say-do-ratio' }, { id: 'forecast-accuracy' }],
  },
  {
    id: 'review-bottleneck',
    label: 'Review bottleneck',
    mechanics: 'Reviews and QA become a queue: pull requests wait about 5× longer for a first review, finished work waits about 3× longer for QA, and each QA check takes 2.5× longer, so QA caps how much the team can finish. Developers keep starting new work.',
    scale: { reviewPickupMedian: 5, reviewDurationMedian: 1.5, qaPickupMedian: 3, qaEffortMedian: 2.5 },
    early: [{ id: 'queue-size' }, { id: 'pr-pickup-time' }, { id: 'aging-wip' }],
    confirming: [{ id: 'flow-efficiency' }, { id: 'cycle-time' }, { id: 'time-to-merge' }],
  },
  {
    id: 'too-much-started',
    label: 'Too much started',
    mechanics: 'Everyone juggles two items at once instead of one. Context switching costs about 15 % of capacity, and each item progresses at half speed.',
    slotsPerDev: 2,
    scale: { focus: 0.425 },
    early: [{ id: 'wip' }, { id: 'net-flow' }, { id: 'aging-wip' }],
    confirming: [{ id: 'lead-time' }, { id: 'cycle-time' }],
  },
  {
    id: 'fat-tail',
    label: 'Fat tail',
    mechanics: 'One started item in five turns out far bigger than estimated (about 60 extra working hours, some much more) and hangs on the board for weeks.',
    stuck: { prob: 0.2, extraHours: 60 },
    early: [{ id: 'aging-wip' }],
    confirming: [{ id: 'sle-attainment' }, { id: 'cycle-time' }],
  },
  {
    id: 'arrivals-exceed-departures',
    label: 'Arrivals exceed departures',
    mechanics: 'Three to five times more requests and bugs arrive. Teams start them on top of current work (two items per person at once), so everything progresses slower.',
    scale: { unplannedPerHour: 5, kanbanArrivalsPerHour: 3, focus: 0.45 },
    slotsPerDev: 2,
    early: [{ id: 'net-flow' }, { id: 'wip' }, { id: 'unplanned-work' }],
    confirming: [{ id: 'sle-attainment' }, { id: 'cycle-time' }],
  },
  {
    id: 'frequent-blockers',
    label: 'Frequent blockers',
    mechanics: 'Almost half of the items hit an external blocker (was about one in eight), and blockers last about 4× longer before they clear or are escalated.',
    set: { blockProb: 0.45 },
    scale: { blockMedian: 4 },
    early: [{ id: 'blocked-items' }, { id: 'aging-wip' }],
    confirming: [{ id: 'cycle-time' }, { id: 'flow-efficiency' }],
  },
  {
    id: 'prod-bugs',
    label: 'Production bugs',
    mechanics: 'Six times more finished work produces a bug in production, and three times more finished work is reopened.',
    set: { escapeProb: 0.15, reopenProb: 0.075 },
    early: [{ id: 'escaped-defects' }, { id: 'reopen-rate' }],
    confirming: [{ id: 'unplanned-work' }, { id: 'sprint-scope-change' }],
  },
  {
    id: 'incidents',
    label: 'Incidents',
    mechanics: 'One deployment in seven causes an incident (was 3 %), unrelated incidents are five times as frequent, and detection and recovery take 2–3× longer.',
    set: { changeFailureProb: 0.15 },
    scale: { randomIncidentPerHour: 5, recoveryMedianMin: 3, detectMedianMin: 2 },
    early: [{ id: 'error-budget-burn' }, { id: 'change-failure-rate' }],
    confirming: [{ id: 'rework-rate' }, { id: 'slo-attainment' }],
  },
  {
    id: 'red-ci',
    label: 'Red CI',
    mechanics: 'Builds on main break about ten times as often, flaky failures are six times as frequent, fixes take 6× longer and the pipeline is slower. Deployments wait while main is red.',
    set: { mainFailProb: 0.2, flakyProb: 0.08 },
    scale: { fixMedian: 6, pipelineMedianMin: 1.3 },
    early: [{ id: 'red-main-time' }, { id: 'main-build-success' }, { id: 'flaky-rate' }],
    confirming: [{ id: 'deployment-frequency' }, { id: 'lead-time-for-changes' }],
  },
  {
    id: 'scope-creep',
    label: 'Scope creep',
    mechanics: 'New stories keep being discovered inside committed features (about one per team per day) and are pulled into the running sprint ahead of the plan.',
    discoverPerDay: 1,
    early: [{ id: 'program-scope-growth' }, { id: 'pi-forecast' }],
    confirming: [{ id: 'say-do-ratio' }, { id: 'carry-over' }],
  },
  {
    id: 'shifting-priorities',
    label: 'Shifting priorities',
    mechanics: 'Four times more urgent requests interrupt the sprint, and about every other day per team a not-started committed story is swapped for a new "top priority" one.',
    scale: { unplannedPerHour: 4 },
    reprioritizePerDay: 0.5,
    early: [{ id: 'unplanned-work' }, { id: 'program-scope-growth' }],
    confirming: [{ id: 'say-do-ratio' }, { id: 'sprint-goal-success' }],
  },
  {
    id: 'waiting-on-teams',
    label: 'Waiting on other teams',
    mechanics: 'Platform puts the enablers other teams wait for behind its own work, and new cross-team dependencies keep appearing mid-PI (about one per stream team every other day, needed within 3 days).',
    platformBusy: { newDepPerDay: 0.5, needByHours: 24 },
    early: [{ id: 'overdue-dependencies' }, { id: 'critical-path-drift' }, { id: 'blocked-items' }],
    confirming: [{ id: 'say-do-ratio' }, { id: 'carry-over' }],
  },
]

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]))

/** The profile while a scenario is active. */
export function scenarioProfile(base: Profile, s: ScenarioDef | undefined): Profile {
  if (!s) return base
  const p: Profile = { ...base }
  const rec = p as unknown as Record<string, number>
  for (const [k, f] of Object.entries(s.scale ?? {})) rec[k] = rec[k] * (f as number)
  for (const [k, v] of Object.entries(s.set ?? {})) rec[k] = v as number
  return p
}
