import { HOUR_MS, workingDaysBetween } from '../../sim/calendar'
import { inScope, inWindow, windowStart } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute, MetricResult } from '../types'

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
    recordValue: 'changes',
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
    recordValue: 'hours',
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
    recordValue: 'minutes',
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
    recordValue: 'hours',
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

// ---- Stage 2 delivery / PR / CI metrics -------------------------------------

/** DORA rework rate: unplanned deployments made because of a production incident. */
export const reworkRate: MetricCompute = (ctx) => {
  const deps = ctx.store.deployments.filter((d) => inScope(ctx, d.teamId) && inWindow(ctx, d.at))
  const rework = deps.filter((d) => d.kind === 'rollback' || d.kind === 'hotfix')
  return {
    value: deps.length ? (100 * rework.length) / deps.length : null,
    secondary: [
      { label: 'rework', value: rework.length },
      { label: 'deployments', value: deps.length },
    ],
    n: deps.length,
    records: rework.map((d) => ({ id: d.id, teamId: d.teamId, label: d.service, to: d.at, value: 1, detail: d.kind })),
  }
}

export const timeToMerge: MetricCompute = (ctx) => {
  const mrs = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.mergedAt))
  const hours = mrs.map((m) => (m.mergedAt! - m.openedAt) / HOUR_MS)
  return {
    value: percentile(hours, 50),
    secondary: [{ label: 'P85', value: percentile(hours, 85), unit: 'h' }],
    n: mrs.length,
    recordValue: 'hours',
    records: mrs.map((m, k) => ({ id: m.id, teamId: m.teamId, label: `${m.itemId} · ${m.size} lines`, from: m.openedAt, to: m.mergedAt, value: hours[k] })),
  }
}

export const prSize: MetricCompute = (ctx) => {
  const mrs = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.mergedAt))
  const sizes = mrs.map((m) => m.size)
  return {
    value: percentile(sizes, 50),
    secondary: [{ label: 'P85', value: percentile(sizes, 85), unit: 'lines' }],
    n: mrs.length,
    recordValue: 'lines',
    records: mrs.map((m) => ({ id: m.id, teamId: m.teamId, label: m.itemId, to: m.mergedAt, value: m.size, detail: m.aiAssisted ? 'AI-assisted' : undefined })),
  }
}

export const pipelineDuration: MetricCompute = (ctx) => {
  const runs = ctx.store.pipelines.filter((r) => inScope(ctx, r.teamId) && inWindow(ctx, r.finishedAt))
  const mins = runs.map((r) => (r.finishedAt - r.startedAt) / 60_000)
  return {
    value: percentile(mins, 95),
    secondary: [{ label: 'P50', value: percentile(mins, 50), unit: 'min' }],
    n: runs.length,
    recordValue: 'minutes',
    records: runs.map((r, k) => ({ id: r.id, teamId: r.teamId, label: r.mrId ?? 'fix commit', from: r.startedAt, to: r.finishedAt, value: mins[k], detail: r.result })),
  }
}

/** Flaky: a failed run on main that went green on a re-run without code changes. */
export const flakyRate: MetricCompute = (ctx) => {
  const runs = ctx.store.pipelines.filter((r) => inScope(ctx, r.teamId) && inWindow(ctx, r.finishedAt))
  const retried = new Set(ctx.store.pipelines.filter((r) => r.retryOf && r.result === 'success').map((r) => r.retryOf!))
  const flaky = runs.filter((r) => r.result === 'failed' && retried.has(r.id))
  return {
    value: runs.length ? (100 * flaky.length) / runs.length : null,
    secondary: [
      { label: 'flaky', value: flaky.length },
      { label: 'runs', value: runs.length },
    ],
    n: runs.length,
    records: flaky.map((r) => ({ id: r.id, teamId: r.teamId, label: r.mrId ?? 'fix commit', from: r.startedAt, to: r.finishedAt, value: 1, detail: 'green on re-run' })),
  }
}

/** Share of team-time in the window during which main was red (failed run → next green run). */
export const redMainTime: MetricCompute = (ctx) => {
  const start = windowStart(ctx)
  let red = 0
  const records: MetricResult['records'] = []
  for (const teamId of ctx.teamIds) {
    const runs = ctx.store.pipelines.filter((r) => r.teamId === teamId && r.finishedAt <= ctx.asOf).sort((a, b) => a.finishedAt - b.finishedAt)
    let redSince: number | undefined
    let redRun: string | undefined
    const close = (until: number) => {
      const a = Math.max(redSince!, start)
      if (until > a) {
        red += until - a
        records.push({ id: redRun!, teamId, label: 'main red', from: redSince, to: until, value: (until - redSince!) / 60_000 })
      }
      redSince = undefined
    }
    for (const r of runs) {
      if (r.result === 'failed' && redSince === undefined) {
        redSince = r.finishedAt
        redRun = r.id
      } else if (r.result === 'success' && redSince !== undefined) close(r.finishedAt)
    }
    if (redSince !== undefined) close(ctx.asOf)
  }
  const total = ctx.teamIds.length * (ctx.asOf - start)
  return {
    value: total ? (100 * red) / total : null,
    secondary: [{ label: 'red hours', value: red / HOUR_MS, unit: 'h' }],
    n: records.length,
    recordValue: 'minutes',
    records,
  }
}
