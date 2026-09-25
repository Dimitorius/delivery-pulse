// Compute functions keyed by registry id. Metadata lives in registry/metrics/*.yaml.
import type { MetricCompute } from '../types'
import { aiCfrRatio, aiShare } from './ai'
import {
  changeFailureRate,
  deploymentFrequency,
  failedDeploymentRecovery,
  flakyRate,
  leadTimeForChanges,
  mainBuildSuccess,
  pipelineDuration,
  prPickupTime,
  prSize,
  redMainTime,
  reworkRate,
  timeToMerge,
} from './delivery'
import { agingWip, blockedItems, cycleTime, flowDistribution, flowEfficiency, leadTime, netFlow, queueSize, sleAttainment, throughput, unplannedShare, wip } from './flow'
import { forecastAccuracy, mcHowMany, piForecast } from './forecast'
import { criticalPathDrift, dependencyLeadTime, investmentAllocation, milestoneHitRate, overdueDependencies, programScopeGrowth, riskExposure } from './program'
import { errorBudgetBurn, escapedDefects, incidentMttr, incidentsBySeverity, mtta, postmortemActionClosure, reopenRate, sloAttainment } from './quality'
import { piPredictability } from './safe'
import { carryOver, sayDoRatio, sprintGoalSuccess, sprintScopeChange, velocity } from './scrum'
import { cpi, dxi, ebmCurrentValue, enps } from './synthetic'

export const COMPUTE: Record<string, MetricCompute> = {
  // Flow (11)
  throughput,
  'cycle-time': cycleTime,
  'lead-time': leadTime,
  wip,
  'aging-wip': agingWip,
  'flow-efficiency': flowEfficiency,
  'net-flow': netFlow,
  'blocked-items': blockedItems,
  'queue-size': queueSize,
  'sle-attainment': sleAttainment,
  'flow-distribution': flowDistribution,
  // Scrum (5)
  'sprint-goal-success': sprintGoalSuccess,
  'say-do-ratio': sayDoRatio,
  'carry-over': carryOver,
  'sprint-scope-change': sprintScopeChange,
  velocity,
  // DORA (5)
  'deployment-frequency': deploymentFrequency,
  'lead-time-for-changes': leadTimeForChanges,
  'change-failure-rate': changeFailureRate,
  'failed-deployment-recovery-time': failedDeploymentRecovery,
  'rework-rate': reworkRate,
  // PR / CI (7)
  'pr-pickup-time': prPickupTime,
  'time-to-merge': timeToMerge,
  'pr-size': prSize,
  'main-build-success': mainBuildSuccess,
  'pipeline-duration': pipelineDuration,
  'flaky-rate': flakyRate,
  'red-main-time': redMainTime,
  // Quality & reliability (8)
  'escaped-defects': escapedDefects,
  'reopen-rate': reopenRate,
  'incidents-by-severity': incidentsBySeverity,
  mtta,
  'incident-mttr': incidentMttr,
  'slo-attainment': sloAttainment,
  'error-budget-burn': errorBudgetBurn,
  'postmortem-action-closure': postmortemActionClosure,
  // Program (8)
  'overdue-dependencies': overdueDependencies,
  'dependency-lead-time': dependencyLeadTime,
  'milestone-hit-rate': milestoneHitRate,
  'critical-path-drift': criticalPathDrift,
  'program-scope-growth': programScopeGrowth,
  'risk-exposure': riskExposure,
  'unplanned-work': unplannedShare,
  'investment-allocation': investmentAllocation,
  // Forecast (3)
  'pi-forecast': piForecast,
  'mc-how-many': mcHowMany,
  'forecast-accuracy': forecastAccuracy,
  // SAFe (1)
  'pi-predictability': piPredictability,
  // AI (2)
  'ai-share': aiShare,
  'ai-cfr-ratio': aiCfrRatio,
  // SYNTHETIC (value / people / finance)
  dxi,
  enps,
  'ebm-current-value': ebmCurrentValue,
  cpi,
}
