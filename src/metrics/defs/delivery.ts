import { HOUR_MS, workingDaysBetween } from '../../sim/calendar'
import { inScope, inWindow, windowStart } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute } from '../types'

export const deploymentFrequency: MetricCompute = (ctx) => {
  const deps = ctx.store.deployments.filter((d) => d.kind === 'regular' && inScope(ctx, d.teamId) && inWindow(ctx, d.at))
  const services = new Set(ctx.store.teams.filter((t) => inScope(ctx, t.id)).map((t) => t.service)).size
  const days = workingDaysBetween(windowStart(ctx), ctx.asOf)
  return {
    value: days > 0 && services > 0 ? deps.length / days / services : null,
    secondary: [
      { label: 'deployments', value: deps.length },
      { label: 'working days', value: days },
      { label: 'services', value: services },
    ],
    n: deps.length,
    records: deps.map((d) => ({ id: d.id, teamId: d.teamId, label: d.service, to: d.at, value: d.mrIds.length, detail: `${d.mrIds.length} changes` })),
  }
}

export const leadTimeForChanges: MetricCompute = (ctx) => {
  const mrs = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.deployedAt))
  const hours = mrs.map((m) => (m.deployedAt! - m.firstCommitAt) / HOUR_MS)
  return {
    value: percentile(hours, 50),
    secondary: [{ label: 'P85', value: percentile(hours, 85), unit: 'h' }],
    n: mrs.length,
    records: mrs.map((m, k) => ({
      id: m.id,
      teamId: m.teamId,
      label: `${m.itemId} · ${m.size} lines`,
      from: m.firstCommitAt,
      to: m.deployedAt,
      value: hours[k],
      detail: m.deploymentId,
    })),
  }
}

export const changeFailureRate: MetricCompute = (ctx) => {
  const deps = ctx.store.deployments.filter((d) => d.kind === 'regular' && inScope(ctx, d.teamId) && inWindow(ctx, d.at))
  const failedIds = new Set(
    ctx.store.incidentList.filter((i) => i.deploymentId && i.detectedAt <= ctx.asOf).map((i) => i.deploymentId!),
  )
  const failed = deps.filter((d) => failedIds.has(d.id))
  return {
    value: deps.length ? (100 * failed.length) / deps.length : null,
    secondary: [
      { label: 'failed', value: failed.length },
      { label: 'deployments', value: deps.length },
    ],
    n: deps.length,
    records: failed.map((d) => ({ id: d.id, teamId: d.teamId, label: d.service, to: d.at, value: 1, detail: 'caused an incident' })),
  }
}

export const failedDeploymentRecovery: MetricCompute = (ctx) => {
  const incidents = ctx.store.incidentList.filter(
    (i) => i.deploymentId && inScope(ctx, i.teamId) && inWindow(ctx, i.resolvedAt),
  )
  const rows = incidents.map((i) => {
    const dep = ctx.store.deploymentById.get(i.deploymentId!)
    const from = dep?.at ?? i.startedAt
    return { i, from, minutes: (i.resolvedAt! - from) / 60_000 }
  })
  const minutes = rows.map((r) => r.minutes)
  return {
    value: percentile(minutes, 50),
    secondary: [{ label: 'P85', value: percentile(minutes, 85), unit: 'min' }],
    n: rows.length,
    records: rows.map((r) => ({
      id: r.i.id,
      teamId: r.i.teamId,
      label: `SEV${r.i.sev} ${r.i.title}`,
      from: r.from,
      to: r.i.resolvedAt,
      value: r.minutes,
      detail: r.i.deploymentId,
    })),
  }
}

export const prPickupTime: MetricCompute = (ctx) => {
  const mrs = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.firstReviewAt))
  const hours = mrs.map((m) => (m.firstReviewAt! - m.openedAt) / HOUR_MS)
  return {
    value: percentile(hours, 50),
    secondary: [{ label: 'P85', value: percentile(hours, 85), unit: 'h' }],
    n: mrs.length,
    records: mrs.map((m, k) => ({
      id: m.id,
      teamId: m.teamId,
      label: `${m.itemId} · ${m.size} lines`,
      from: m.openedAt,
      to: m.firstReviewAt,
      value: hours[k],
    })),
  }
}

export const mainBuildSuccess: MetricCompute = (ctx) => {
  const runs = ctx.store.pipelines.filter((r) => inScope(ctx, r.teamId) && inWindow(ctx, r.finishedAt))
  const ok = runs.filter((r) => r.result === 'success')
  return {
    value: runs.length ? (100 * ok.length) / runs.length : null,
    secondary: [
      { label: 'green', value: ok.length },
      { label: 'runs', value: runs.length },
    ],
    n: runs.length,
    records: runs
      .filter((r) => r.result === 'failed')
      .map((r) => ({
        id: r.id,
        teamId: r.teamId,
        label: r.mrId ? `main after ${r.mrId}` : 'main (fix commit)',
        from: r.startedAt,
        to: r.finishedAt,
        value: 0,
        detail: 'failed',
      })),
  }
}
