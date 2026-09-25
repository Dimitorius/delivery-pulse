// Canonical entity model (SPEC §4). Future adapters (Jira, GitLab/GitHub, CI,
// monitoring) must produce these same entities, so metrics never know where
// the data came from. All timestamps are epoch milliseconds (UTC).

export type TeamId = string

export interface Program {
  id: string
  name: string
}

export interface Team {
  id: TeamId
  key: string // work item key prefix, e.g. "CHK"
  name: string
  method: 'scrum' | 'kanban'
  kind: 'stream' | 'platform'
  service: string // the production service this team deploys
  devs: number
  qa: number
}

// ---- Work items & workflow -------------------------------------------------

export type WorkItemType = 'epic' | 'feature' | 'story' | 'bug' | 'task'

/** Flow Framework item classes (Kersten, "Project to Product"). */
export type FlowType = 'feature' | 'defect' | 'debt' | 'risk'

/** Investment allocation buckets (features / tech debt / keep-the-lights-on). */
export type Investment = 'feature' | 'debt' | 'ktlo'

export type StatusName =
  | 'Backlog'
  | 'To Do'
  | 'In Progress'
  | 'Ready for Review'
  | 'In Review'
  | 'Ready for QA'
  | 'In QA'
  | 'Done'

/**
 * Status categories. "backlog" is before the commitment point, so it is not
 * part of cycle time. "active" = someone is working on it, "queue" = waiting.
 */
export type StatusCategory = 'backlog' | 'active' | 'queue' | 'done'

/** Default workflow mapping. An adapter would supply the team's own mapping. */
export const STATUS_CATEGORY: Record<StatusName, StatusCategory> = {
  Backlog: 'backlog',
  'To Do': 'backlog',
  'In Progress': 'active',
  'Ready for Review': 'queue',
  'In Review': 'active',
  'Ready for QA': 'queue',
  'In QA': 'active',
  Done: 'done',
}

export const WORKFLOW: StatusName[] = [
  'Backlog',
  'To Do',
  'In Progress',
  'Ready for Review',
  'In Review',
  'Ready for QA',
  'In QA',
  'Done',
]

export interface StatusTransition {
  at: number
  from: StatusName | null
  to: StatusName
}

export interface BlockInterval {
  start: number
  end?: number // open while undefined
  reason: 'dependency' | 'external'
  dependencyId?: string
}

export interface WorkItem {
  id: string // e.g. "CHK-104"
  teamId: TeamId
  type: WorkItemType
  title: string
  parentId?: string
  points?: number
  flowType: FlowType
  investment: Investment
  /** false = unplanned work (interrupts, expedite, production bugs). */
  planned: boolean
  piId?: string
  /** SAFe uncommitted (stretch) PI objective: planned, but not in the PI commitment. */
  piStretch?: boolean
  createdAt: number
  status: StatusName
  transitions: StatusTransition[]
  /** Sprint assignment history (carry-over appends the next sprint). */
  sprintIds: string[]
  blocks: BlockInterval[]
  // Derived by the projection for fast metric queries:
  firstActiveAt?: number
  doneAt?: number
}

// ---- Iterations & dependencies ---------------------------------------------

export interface Iteration {
  id: string
  kind: 'sprint' | 'pi'
  /** SAFe Innovation & Planning iteration (last iteration of a PI). */
  ip?: boolean
  teamId?: TeamId // sprints only
  name: string
  index: number
  start: number
  end: number
  goal?: string
  committedItemIds: string[]
  goalItemIds: string[]
  closedAt?: number
  goalMet?: boolean
}

export interface DependencyLink {
  id: string
  fromItemId: string // consumer (needs the work)
  toItemId: string // provider (does the work)
  fromTeamId: TeamId
  toTeamId: TeamId
  needBy: number
  createdAt: number
  resolvedAt?: number
}

// ---- Engineering: MRs, CI, deployments, incidents --------------------------

export interface MergeRequest {
  id: string
  itemId: string
  teamId: TeamId
  firstCommitAt: number
  openedAt: number
  firstReviewAt?: number
  reviews: { at: number; outcome: 'approved' | 'changes' }[]
  mergedAt?: number
  size: number // changed lines
  aiAssisted: boolean
  deploymentId?: string
  deployedAt?: number
}

export interface PipelineRun {
  id: string
  teamId: TeamId
  branch: 'main'
  mrId?: string
  startedAt: number
  finishedAt: number
  result: 'success' | 'failed'
  /** Set on a re-run of a failed pipeline without code changes. */
  retryOf?: string
}

export interface Deployment {
  id: string
  teamId: TeamId
  service: string
  at: number
  mrIds: string[]
  kind: 'regular' | 'rollback'
}

export interface Incident {
  id: string
  teamId: TeamId
  service: string
  sev: 1 | 2 | 3 | 4
  title: string
  startedAt: number // impact start
  detectedAt: number
  ackedAt?: number
  resolvedAt?: number // service restored
  deploymentId?: string // set when a deployment caused it
}

// ---- Canon entities not simulated yet (stage 2+) ---------------------------

export interface Risk {
  id: string
  title: string
  probability: number // 0..1
  impact: number // cost units
  ownerTeamId?: TeamId
  openedAt: number
  closedAt?: number
}

export interface Milestone {
  id: string
  name: string
  due: number
  achievedAt?: number
}

export interface SurveySnapshot {
  id: string
  at: number
  instrument: string
  scores: Record<string, number>
}

export interface CostEntry {
  id: string
  at: number
  teamId?: TeamId
  amount: number
  category: string
}

export interface Annotation {
  id: string
  at: number
  text: string
  metricIds?: string[]
}

export interface MetricDefinitionChange {
  id: string
  at: number
  metricId: string
  change: string
}
