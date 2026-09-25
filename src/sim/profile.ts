// Simulation parameters tuned to the "elite, deliberately not 100%" profile
// from SPEC §3. Calibration tests (simulator.calibration.test.ts) check the
// resulting metrics stay in the promised bands, so change these with care.
// Durations are in working hours unless the name says otherwise.

export const ELITE_PROFILE = {
  // Development
  focus: 0.8, // share of a dev's working hour on an item that is real progress
  devGapMedian: 5, // after a stint: reviews, meetings, support before pulling again
  hoursPerPoint: 1.1, // median effort per story point
  effortSigma: 0.7, // log-space spread → fat right tail
  bugEffortMedian: 2.5,
  taskEffortMedian: 3,
  blockProb: 0.12, // chance an item hits an external blocker
  blockMedian: 5,
  blockSigma: 1.1,

  // Code review
  firstCommitLeadMedian: 1, // first commit of the MR branch before MR opens
  reviewPickupMedian: 1.7,
  reviewPickupSigma: 1.0,
  reviewDurationMedian: 0.6,
  changesRequestedProb: 0.22,
  changesRequestedAgainProb: 0.05,
  reworkShare: [0.1, 0.3] as [number, number],

  // QA
  qaPickupMedian: 5,
  qaPickupSigma: 0.9,
  qaEffortMedian: 1.3,
  qaFailProb: 0.08,

  // CI on main (minutes)
  pipelineMedianMin: 7,
  pipelineSigma: 0.25,
  mainFailProb: 0.022,
  flakyProb: 0.014,
  fixMedian: 0.8,

  // Deployments & incidents (minutes where stated)
  deployProbPerHour: 0.5,
  changeFailureProb: 0.035,
  detectMedianMin: 6,
  ackMedianMin: 4,
  recoveryMedianMin: 24,
  recoverySigma: 0.8,
  randomIncidentPerHour: 0.003, // program-wide, not deployment-related
  escapeProb: 0.025, // done item later produces a production bug
  hotfixShare: 0.35, // failed deployments fixed forward by a hotfix instead of a rollback
  reopenProb: 0.025, // finished item reopened later
  aiCulpritWeight: 1.2, // simulation assumption: AI-assisted changes 1.2× as likely to be the cause
  sliBaseErrorRate: 0.0002, // background failed-request share
  sliSevErrorRate: { 1: 0.3, 2: 0.08, 3: 0.02, 4: 0.005 } as Record<1 | 2 | 3 | 4, number>,
  costPerPersonWeek: 2.4, // k€, fully loaded (synthetic finance)

  // Planning
  initialVelocityPerDev: 7, // points per dev per sprint before history exists
  commitFactor: 1.0, // commitment = velocity × factor
  debtShare: 0.18, // share of sprint commitment reserved for tech debt / KTLO tasks
  // PI commitment (SAFe): ~80 % of the feature capacity of the 4 development
  // iterations; feature capacity = velocity minus tech-debt share minus a reserve for unplanned work.
  piCommitShare: 0.8,
  unplannedReserve: 0.12,
  piStretchLoad: 0.15, // uncommitted (stretch) objectives on top of the commitment
  ipCommitShare: 0.6, // IP iteration commits to a smaller share of velocity
  ipInnovationShare: 0.5, // of which this share is innovation spikes
  depPerFeature: 0.35, // chance a stream feature needs something from Platform
  scopeGrowthProb: 0.3, // per team per sprint: a story is discovered mid-PI
  unplannedPerHour: 0.04, // scrum team interrupts (bugs, urgent requests)
  kanbanArrivalsPerHour: 0.3,
  expediteShare: 0.12,
}

export type Profile = typeof ELITE_PROFILE
