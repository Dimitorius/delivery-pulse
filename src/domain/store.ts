// Projection: folds the event log into canonical entities. Metrics read only
// from this store, never from simulator internals.

import type { SimEvent } from './events'
import {
  STATUS_CATEGORY,
  type DependencyLink,
  type Deployment,
  type Incident,
  type Iteration,
  type MergeRequest,
  type PipelineRun,
  type Program,
  type Team,
  type WorkItem,
} from './model'

export interface FeedEntry {
  t: number
  kind: 'deploy' | 'rollback' | 'incident' | 'resolved' | 'sprint' | 'blocked' | 'ci' | 'dependency' | 'pi'
  tone: 'ok' | 'warn' | 'bad' | 'info'
  teamId?: string
  text: string
}

export interface Store {
  now: number
  eventCount: number
  program?: Program
  teams: Team[]
  teamById: Map<string, Team>
  items: Map<string, WorkItem>
  itemList: WorkItem[]
  iterations: Map<string, Iteration>
  iterationList: Iteration[]
  mrs: Map<string, MergeRequest>
  mrList: MergeRequest[]
  pipelines: PipelineRun[]
  deployments: Deployment[]
  deploymentById: Map<string, Deployment>
  incidents: Map<string, Incident>
  incidentList: Incident[]
  dependencies: Map<string, DependencyLink>
  dependencyList: DependencyLink[]
  feed: FeedEntry[]
}

const FEED_MAX = 400

export function createStore(): Store {
  return {
    now: 0,
    eventCount: 0,
    teams: [],
    teamById: new Map(),
    items: new Map(),
    itemList: [],
    iterations: new Map(),
    iterationList: [],
    mrs: new Map(),
    mrList: [],
    pipelines: [],
    deployments: [],
    deploymentById: new Map(),
    incidents: new Map(),
    incidentList: [],
    dependencies: new Map(),
    dependencyList: [],
    feed: [],
  }
}

export function buildStore(events: Iterable<SimEvent>): Store {
  const s = createStore()
  for (const e of events) apply(s, e)
  return s
}

function feed(s: Store, entry: FeedEntry) {
  s.feed.push(entry)
  if (s.feed.length > FEED_MAX) s.feed.splice(0, s.feed.length - FEED_MAX)
}

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`Event refers to unknown ${what}`)
  return v
}

export function apply(s: Store, e: SimEvent): void {
  s.eventCount++
  if (e.t > s.now) s.now = e.t
  switch (e.type) {
    case 'program.defined': {
      s.program = e.program
      s.teams = e.teams
      s.teamById = new Map(e.teams.map((t) => [t.id, t]))
      break
    }
    case 'iteration.planned': {
      const it: Iteration = { ...e.iteration, committedItemIds: [], goalItemIds: [] }
      s.iterations.set(it.id, it)
      s.iterationList.push(it)
      if (it.kind === 'pi') feed(s, { t: e.t, kind: 'pi', tone: 'info', text: `${it.name} started` })
      break
    }
    case 'iteration.committed': {
      const it = must(s.iterations.get(e.iterationId), 'iteration')
      it.committedItemIds = e.itemIds
      it.goalItemIds = e.goalItemIds
      it.goal = e.goal
      feed(s, {
        t: e.t,
        kind: 'sprint',
        tone: 'info',
        teamId: it.teamId,
        text: `${it.name} planned · ${e.itemIds.length} items${e.goal ? ` · goal: ${e.goal}` : ''}`,
      })
      break
    }
    case 'iteration.closed': {
      const it = must(s.iterations.get(e.iterationId), 'iteration')
      it.closedAt = e.t
      it.goalMet = e.goalMet
      if (it.kind === 'sprint') {
        feed(s, {
          t: e.t,
          kind: 'sprint',
          tone: e.goalMet ? 'ok' : 'warn',
          teamId: it.teamId,
          text: `${it.name} closed · goal ${e.goalMet ? 'met' : 'missed'}`,
        })
      }
      break
    }
    case 'item.created': {
      const item: WorkItem = {
        ...e.item,
        createdAt: e.t,
        status: 'Backlog',
        transitions: [{ at: e.t, from: null, to: 'Backlog' }],
        sprintIds: [],
        blocks: [],
      }
      s.items.set(item.id, item)
      s.itemList.push(item)
      break
    }
    case 'item.status': {
      const item = must(s.items.get(e.itemId), 'item')
      item.transitions.push({ at: e.t, from: item.status, to: e.to })
      item.status = e.to
      const cat = STATUS_CATEGORY[e.to]
      if (item.firstActiveAt === undefined && (cat === 'active' || cat === 'queue')) item.firstActiveAt = e.t
      if (cat === 'done') item.doneAt = e.t
      break
    }
    case 'item.sprint': {
      must(s.items.get(e.itemId), 'item').sprintIds.push(e.iterationId)
      break
    }
    case 'item.blocked': {
      const item = must(s.items.get(e.itemId), 'item')
      item.blocks.push({ start: e.t, reason: e.reason, dependencyId: e.dependencyId })
      const dep = e.dependencyId ? s.dependencies.get(e.dependencyId) : undefined
      feed(s, {
        t: e.t,
        kind: 'blocked',
        tone: 'warn',
        teamId: item.teamId,
        text: `${item.id} blocked${dep ? ` · waiting for ${dep.toItemId}` : ''}`,
      })
      break
    }
    case 'item.unblocked': {
      const item = must(s.items.get(e.itemId), 'item')
      const open = item.blocks.find((b) => b.end === undefined)
      if (open) open.end = e.t
      break
    }
    case 'dependency.created': {
      const d: DependencyLink = { ...e.dependency, createdAt: e.t }
      s.dependencies.set(d.id, d)
      s.dependencyList.push(d)
      break
    }
    case 'dependency.resolved': {
      const d = must(s.dependencies.get(e.dependencyId), 'dependency')
      d.resolvedAt = e.t
      feed(s, {
        t: e.t,
        kind: 'dependency',
        tone: e.t > d.needBy ? 'warn' : 'ok',
        teamId: d.toTeamId,
        text: `${d.toItemId} delivered for ${d.fromItemId}${e.t > d.needBy ? ' (late)' : ''}`,
      })
      break
    }
    case 'mr.opened': {
      const mr: MergeRequest = { ...e.mr, openedAt: e.t, reviews: [] }
      s.mrs.set(mr.id, mr)
      s.mrList.push(mr)
      break
    }
    case 'mr.review.started': {
      const mr = must(s.mrs.get(e.mrId), 'merge request')
      if (mr.firstReviewAt === undefined) mr.firstReviewAt = e.t
      break
    }
    case 'mr.reviewed': {
      must(s.mrs.get(e.mrId), 'merge request').reviews.push({ at: e.t, outcome: e.outcome })
      break
    }
    case 'mr.merged': {
      must(s.mrs.get(e.mrId), 'merge request').mergedAt = e.t
      break
    }
    case 'pipeline.finished': {
      s.pipelines.push({ ...e.run, finishedAt: e.t })
      if (e.run.result === 'failed') {
        const team = s.teamById.get(e.run.teamId)
        feed(s, {
          t: e.t,
          kind: 'ci',
          tone: 'bad',
          teamId: e.run.teamId,
          text: `main pipeline failed · ${team?.service ?? e.run.teamId}`,
        })
      }
      break
    }
    case 'deployment': {
      const d: Deployment = { ...e.deployment, at: e.t }
      s.deployments.push(d)
      s.deploymentById.set(d.id, d)
      for (const id of d.mrIds) {
        const mr = s.mrs.get(id)
        if (mr) {
          mr.deploymentId = d.id
          mr.deployedAt = e.t
        }
      }
      feed(s, {
        t: e.t,
        kind: d.kind === 'rollback' ? 'rollback' : 'deploy',
        tone: d.kind === 'rollback' ? 'warn' : 'ok',
        teamId: d.teamId,
        text:
          d.kind === 'rollback'
            ? `rollback · ${d.service}`
            : `deployed ${d.service} · ${d.mrIds.length} change${d.mrIds.length === 1 ? '' : 's'}`,
      })
      break
    }
    case 'incident.opened': {
      const inc: Incident = { ...e.incident, detectedAt: e.t }
      s.incidents.set(inc.id, inc)
      s.incidentList.push(inc)
      feed(s, {
        t: e.t,
        kind: 'incident',
        tone: 'bad',
        teamId: inc.teamId,
        text: `SEV${inc.sev} ${inc.title}`,
      })
      break
    }
    case 'incident.acked': {
      must(s.incidents.get(e.incidentId), 'incident').ackedAt = e.t
      break
    }
    case 'incident.resolved': {
      const inc = must(s.incidents.get(e.incidentId), 'incident')
      inc.resolvedAt = e.t
      const mins = Math.round((e.t - inc.startedAt) / 60000)
      feed(s, {
        t: e.t,
        kind: 'resolved',
        tone: 'ok',
        teamId: inc.teamId,
        text: `${inc.id} resolved · ${mins} min`,
      })
      break
    }
  }
}
