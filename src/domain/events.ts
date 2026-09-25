// The append-only event log. The simulator (and, later, source adapters) emit
// these; the projection in store.ts folds them into the canonical entities.
// Every event carries `t`, the moment it happened (epoch ms).

import type {
  CostEntry,
  DependencyLink,
  Deployment,
  Incident,
  Iteration,
  Milestone,
  PiObjective,
  PipelineRun,
  Program,
  Risk,
  SliWindow,
  StatusName,
  SurveySnapshot,
  Team,
  ValueSnapshot,
  WorkItem,
} from './model'

type At<T> = T & { t: number }

export type NewWorkItem = Omit<
  WorkItem,
  'status' | 'transitions' | 'sprintIds' | 'blocks' | 'firstActiveAt' | 'doneAt' | 'createdAt'
>

export type SimEvent = At<
  | { type: 'program.defined'; program: Program; teams: Team[] }
  | {
      type: 'iteration.planned'
      iteration: Omit<Iteration, 'committedItemIds' | 'goalItemIds' | 'closedAt' | 'goalMet'>
    }
  | { type: 'iteration.committed'; iterationId: string; itemIds: string[]; goalItemIds: string[]; goal?: string }
  | { type: 'iteration.closed'; iterationId: string; goalMet?: boolean }
  | { type: 'item.created'; item: NewWorkItem }
  | { type: 'item.status'; itemId: string; to: StatusName }
  | { type: 'item.sprint'; itemId: string; iterationId: string }
  | { type: 'item.blocked'; itemId: string; reason: 'dependency' | 'external'; dependencyId?: string }
  | { type: 'item.unblocked'; itemId: string }
  | { type: 'dependency.created'; dependency: Omit<DependencyLink, 'createdAt' | 'resolvedAt'> }
  | { type: 'dependency.resolved'; dependencyId: string }
  | {
      type: 'mr.opened'
      mr: { id: string; itemId: string; teamId: string; firstCommitAt: number; size: number; aiAssisted: boolean }
    }
  | { type: 'mr.review.started'; mrId: string }
  | { type: 'mr.reviewed'; mrId: string; outcome: 'approved' | 'changes' }
  | { type: 'mr.merged'; mrId: string }
  | { type: 'pipeline.finished'; run: Omit<PipelineRun, 'finishedAt'> }
  | { type: 'deployment'; deployment: Omit<Deployment, 'at'> }
  | { type: 'incident.opened'; incident: Omit<Incident, 'detectedAt' | 'ackedAt' | 'resolvedAt'> }
  | { type: 'incident.acked'; incidentId: string }
  | { type: 'incident.resolved'; incidentId: string }
  | { type: 'incident.postmortem'; incidentId: string; actionItemIds: string[] }
  | { type: 'sli.windows'; windows: Omit<SliWindow, 'end'>[] }
  | { type: 'milestone.planned'; milestone: Omit<Milestone, 'plannedAt' | 'achievedAt'> }
  | { type: 'milestone.achieved'; milestoneId: string }
  | { type: 'risk.raised'; risk: Omit<Risk, 'openedAt' | 'closedAt' | 'outcome' | 'history'> }
  | { type: 'risk.updated'; riskId: string; probability: number; impact: number }
  | { type: 'risk.closed'; riskId: string; outcome: 'mitigated' | 'occurred' }
  | { type: 'objective.planned'; objective: Omit<PiObjective, 'actualBv' | 'scoredAt'> }
  | { type: 'objective.scored'; objectiveId: string; actualBv: number }
  | { type: 'survey.snapshot'; survey: Omit<SurveySnapshot, 'at'> }
  | { type: 'cost.entry'; cost: Omit<CostEntry, 'at'> }
  | { type: 'value.snapshot'; value: Omit<ValueSnapshot, 'at'> }
>

export type SimEventType = SimEvent['type']
