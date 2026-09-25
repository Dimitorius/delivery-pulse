// Compute functions keyed by registry id. Metadata lives in registry/metrics/*.yaml.
import type { MetricCompute } from '../types'
import { changeFailureRate, deploymentFrequency, failedDeploymentRecovery, leadTimeForChanges, mainBuildSuccess, prPickupTime } from './delivery'
import { agingWip, blockedItems, cycleTime, flowEfficiency, netFlow, throughput, unplannedShare, wip } from './flow'
import { piForecast } from './forecast'
import { overdueDependencies } from './program'
import { sayDoRatio } from './scrum'

export const COMPUTE: Record<string, MetricCompute> = {
  throughput,
  'cycle-time': cycleTime,
  'lead-time-for-changes': leadTimeForChanges,
  'deployment-frequency': deploymentFrequency,
  'change-failure-rate': changeFailureRate,
  'failed-deployment-recovery-time': failedDeploymentRecovery,
  'say-do-ratio': sayDoRatio,
  wip,
  'flow-efficiency': flowEfficiency,
  'blocked-items': blockedItems,
  'pr-pickup-time': prPickupTime,
  'main-build-success': mainBuildSuccess,
  'net-flow': netFlow,
  'aging-wip': agingWip,
  'overdue-dependencies': overdueDependencies,
  'unplanned-work': unplannedShare,
  'pi-forecast': piForecast,
}
