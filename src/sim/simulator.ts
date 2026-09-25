// Seeded discrete-event simulator of the program (SPEC §3). It models people
// and queues — devs pulling work, reviewers, QA capacity, CI on main,
// deployments, incidents, sprint and PI planning — and only *emits events*.
// Every metric is computed later from those events; nothing here produces a
// ready-made metric series.
//
// Determinism: all randomness comes from one seeded Rng, and scheduled jobs
// run in (time, insertion) order, so the history depends only on the seed —
// not on how often, or in how big steps, advanceTo() is called.

import type { NewWorkItem, SimEvent } from '../domain/events'
import type { FlowType, Investment, StatusName, Team, WorkItemType } from '../domain/model'
import {
  DEV_ITERATIONS_PER_PI,
  HOUR_MS,
  ITERATIONS_PER_PI,
  PI_W,
  SPRINT_W,
  addWorkingHours,
  isIpIteration,
  workToTime,
} from './calendar'
import { BUG_SYMPTOMS, DEBT_TASKS, FEATURE_SUFFIXES, POSTMORTEM_ACTIONS, PROGRAM, RISK_TITLES, SERVICE_TRAFFIC, STORY_VERBS, TEAMS, VOCAB } from './org'
import { ELITE_PROFILE, type Profile } from './profile'
import { Rng } from './rng'
import { Scheduler } from './scheduler'

// Chosen with scripts/seed-search.ts against the elite baseline criteria (docs/stage-1.md).
export const DEFAULT_SEED = 167

type EventBody = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 't'> : never) : never

interface ItemRt {
  id: string
  teamId: string
  type: WorkItemType
  title: string
  points?: number
  parentId?: string
  piId?: string
  piStretch?: boolean
  status: StatusName
  effort: number
  remaining: number
  firstActiveAt?: number
  mrId?: string
  reviewRounds: number
  qaRounds: number
  randomBlockUsed: boolean
  blocked: boolean
  blockedOnDep?: string
  openDeps: Set<string>
  done: boolean
  sprintId?: string
  dev?: DevRt
  reopened?: boolean
  escapeRolled?: boolean
}

interface DevRt {
  item?: ItemRt
  /** Away from item work (reviews, meetings, support) after finishing a stint. */
  away?: boolean
}

interface SprintRt {
  id: string
  ip: boolean
  committed: ItemRt[]
  goalItems: ItemRt[]
  assigned: Set<ItemRt>
  completedPoints: number
}

interface FeatureRt {
  item: ItemRt
  stories: ItemRt[]
}

interface DepRt {
  id: string
  consumer: ItemRt
  provider: ItemRt
}

interface TeamRt {
  team: Team
  devs: DevRt[]
  qaFree: number
  backlog: ItemRt[] // ordered; not yet committed (Scrum) / not yet pulled (Kanban)
  ready: ItemRt[] // sprint commitment still in To Do
  urgent: ItemRt[] // unplanned work jumps the queue
  resume: ItemRt[] // rework or unblocked items waiting for a dev
  qaQueue: ItemRt[]
  pendingDeploy: string[] // merged MRs with a green pipeline, not yet in production
  mainRed: boolean
  openIncidents: number
  sprint?: SprintRt
  carry: ItemRt[]
  velocityHistory: number[]
  itemSeq: number
  featureSeq: number
  features: FeatureRt[]
  assigning: boolean
}

const STORY_POINTS: [number, number][] = [
  [1, 10],
  [2, 25],
  [3, 30],
  [5, 25],
  [8, 10],
]

export class Simulator {
  now: number
  private readonly rng: Rng
  private readonly p: Profile
  private readonly sched = new Scheduler()
  private out: SimEvent[] = []
  private readonly teams: TeamRt[]
  private readonly byTeam = new Map<string, TeamRt>()
  private readonly items = new Map<string, ItemRt>()
  private readonly features = new Map<string, FeatureRt>()
  private readonly providerDeps = new Map<string, DepRt[]>()
  private readonly seq = { mr: 0, run: 0, deploy: 0, incident: 0, dep: 0, ms: 0, risk: 0, obj: 0, survey: 0, cost: 0, value: 0 }
  private piId?: string
  // Stage-2 subsystems draw from their own streams so they do not reshuffle
  // the main history: `ops` for behaviour (hotfix vs rollback, reopen,
  // postmortems), `obs` for observational data (risks, objectives, surveys,
  // costs, cause attribution), `sliRng` for service-level indicators.
  private readonly ops: Rng
  private readonly obs: Rng
  private readonly sliRng: Rng
  private readonly mrAi = new Map<string, boolean>()
  private readonly outages: { service: string; sev: 1 | 2 | 3 | 4; startedAt: number; resolvedAt?: number }[] = []
  private milestonesRt: { id: string; features: FeatureRt[]; achieved: boolean }[] = []
  private objectivesRt: { id: string; feature: FeatureRt; plannedBv: number }[] = []
  private readonly risksRt = new Map<string, { p: number; impact: number }>()

  constructor(seed = DEFAULT_SEED, profile: Profile = ELITE_PROFILE) {
    this.rng = new Rng(seed)
    this.ops = new Rng((seed ^ 0x9e3779b9) >>> 0)
    this.obs = new Rng((seed ^ 0x85ebca6b) >>> 0)
    this.sliRng = new Rng((seed ^ 0xc2b2ae35) >>> 0)
    this.p = profile
    this.now = workToTime(0)
    this.teams = TEAMS.map((team) => ({
      team,
      devs: Array.from({ length: team.devs }, () => ({})),
      qaFree: team.qa,
      backlog: [],
      ready: [],
      urgent: [],
      resume: [],
      qaQueue: [],
      pendingDeploy: [],
      mainRed: false,
      openIncidents: 0,
      carry: [],
      velocityHistory: [],
      itemSeq: 100,
      featureSeq: 0,
      features: [],
      assigning: false,
    }))
    for (const tr of this.teams) this.byTeam.set(tr.team.id, tr)
    this.emit({ type: 'program.defined', program: PROGRAM, teams: TEAMS })
    this.atWork(0, () => this.sprintBoundary(0))
    this.atWork(0, () => this.hourlyTick(0))
    this.at(workToTime(0) + HOUR_MS, () => this.sliTick(workToTime(0)))
  }

  /** Run every scheduled job up to and including `t`; return the new events. */
  advanceTo(t: number): SimEvent[] {
    while (this.sched.peekTime() <= t) {
      const job = this.sched.pop()!
      if (job.t > this.now) this.now = job.t
      job.run()
    }
    if (t > this.now) this.now = t
    const out = this.out
    this.out = []
    return out
  }

  advanceToWork(w: number): SimEvent[] {
    return this.advanceTo(workToTime(w))
  }

  // ---- scheduling helpers ---------------------------------------------------

  private emit(e: EventBody): void {
    this.out.push({ ...e, t: this.now } as SimEvent)
  }

  private at(t: number, run: () => void): void {
    this.sched.push(Math.max(t, this.now), run)
  }

  private atWork(w: number, run: () => void): void {
    this.at(workToTime(w), run)
  }

  private afterWork(hours: number, run: () => void): void {
    this.at(addWorkingHours(this.now, hours), run)
  }

  private afterMinutes(minutes: number, run: () => void): void {
    this.at(this.now + minutes * 60_000, run)
  }

  // ---- calendar processes ---------------------------------------------------

  private get scrumTeams(): TeamRt[] {
    return this.teams.filter((t) => t.team.method === 'scrum')
  }

  private sprintBoundary(k: number): void {
    for (const tr of this.scrumTeams) if (tr.sprint) this.closeSprint(tr)
    if (k % ITERATIONS_PER_PI === 0) {
      this.scoreObjectives()
      this.startPi(k / ITERATIONS_PER_PI)
      this.planPiExtras(k / ITERATIONS_PER_PI)
    }
    this.observeBoundary(k)
    for (const tr of this.scrumTeams) this.planSprint(tr, k)
    this.atWork((k + 1) * SPRINT_W, () => this.sprintBoundary(k + 1))
  }

  private hourlyTick(w: number): void {
    const p = this.p
    for (const tr of this.teams) {
      if (tr.team.method === 'scrum') {
        const n = this.rng.poisson(p.unplannedPerHour)
        for (let i = 0; i < n; i++) this.afterMinutes(this.rng.uniform(0, 60), () => this.unplannedArrival(tr))
      } else {
        const n = this.rng.poisson(p.kanbanArrivalsPerHour)
        for (let i = 0; i < n; i++) this.afterMinutes(this.rng.uniform(0, 60), () => this.kanbanArrival(tr))
      }
      if (tr.pendingDeploy.length && !tr.mainRed && tr.openIncidents === 0 && this.rng.chance(p.deployProbPerHour)) {
        this.afterMinutes(this.rng.uniform(5, 55), () => this.deploy(tr))
      }
    }
    if (this.rng.chance(p.randomIncidentPerHour)) this.randomIncident()
    this.atWork(w + 1, () => this.hourlyTick(w + 1))
  }

  // ---- PI & sprint planning ------------------------------------------------

  private velocity(tr: TeamRt): number {
    const h = tr.velocityHistory.slice(-3)
    if (!h.length) return tr.team.devs * this.p.initialVelocityPerDev
    const sorted = [...h].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) / 2)]
  }

  private startPi(n: number): void {
    if (this.piId) this.emit({ type: 'iteration.closed', iterationId: this.piId })
    const id = `PI-${n + 1}`
    this.piId = id
    const startW = n * PI_W
    this.emit({
      type: 'iteration.planned',
      iteration: { id, kind: 'pi', name: `PI ${n + 1}`, index: n, start: workToTime(startW), end: workToTime(startW + PI_W) },
    })
    const platform = this.teams.find((t) => t.team.kind === 'platform')!
    const providers: { item: ItemRt; needBy: number }[] = []
    for (const tr of this.scrumTeams) {
      tr.features = []
      const perSprint = this.velocity(tr) * this.p.commitFactor * (1 - this.p.debtShare)
      // Unfinished PI scope from earlier PIs goes first, the roadmap last.
      const leftover = tr.backlog.filter((i) => i.piId && !i.piStretch)
      const roadmap = tr.backlog.filter((i) => !i.piId || i.piStretch)
      // Commit against the development iterations only; IP is the buffer.
      const featureCapacity = this.velocity(tr) * DEV_ITERATIONS_PER_PI * (1 - this.p.debtShare) * (1 - this.p.unplannedReserve)
      const capacity = featureCapacity * this.p.piCommitShare
      let points = leftover.reduce((s, i) => s + (i.points ?? 0), 0)
      const planned: ItemRt[] = []
      const stretch: ItemRt[] = []
      while (points < capacity) {
        const before = points
        const stories = this.createFeatureWithStories(tr, id)
        points += stories.reduce((s, i) => s + (i.points ?? 0), 0)
        planned.push(...stories)
        // Cross-team dependency on Platform, only for work expected in sprint 2+.
        const sprintOffset = Math.floor(before / Math.max(perSprint, 1))
        if (tr.team.kind === 'stream' && sprintOffset >= 1 && sprintOffset < DEV_ITERATIONS_PER_PI && this.rng.chance(this.p.depPerFeature)) {
          const obj = this.rng.pick(VOCAB.platform.objects)
          const provider = this.createItem(platform, {
            type: 'story',
            title: `Enabler: ${obj} for ${this.features.get(stories[0].parentId!)!.item.title}`,
            points: this.rng.weighted([
              [2, 3],
              [3, 4],
              [5, 3],
            ]),
            planned: true,
            piId: id,
            flowType: 'feature',
            investment: 'feature',
          })
          const needBy = workToTime(startW + sprintOffset * SPRINT_W)
          const dep: DepRt = { id: `LINK-${++this.seq.dep}`, consumer: stories[0], provider }
          this.emit({
            type: 'dependency.created',
            dependency: {
              id: dep.id,
              fromItemId: stories[0].id,
              toItemId: provider.id,
              fromTeamId: tr.team.id,
              toTeamId: platform.team.id,
              needBy,
            },
          })
          stories[0].openDeps.add(dep.id)
          const list = this.providerDeps.get(provider.id) ?? []
          list.push(dep)
          this.providerDeps.set(provider.id, list)
          providers.push({ item: provider, needBy })
        }
      }
      // SAFe uncommitted objectives: planned into the PI, not in the commitment.
      const stretchCapacity = this.velocity(tr) * DEV_ITERATIONS_PER_PI * this.p.piStretchLoad
      let stretchPoints = 0
      while (stretchPoints < stretchCapacity) {
        const stories = this.createFeatureWithStories(tr, id, true)
        stretchPoints += stories.reduce((s, i) => s + (i.points ?? 0), 0)
        stretch.push(...stories)
      }
      tr.backlog = [...leftover, ...planned, ...stretch, ...roadmap]
      this.refillRoadmap(tr)
    }
    providers.sort((a, b) => a.needBy - b.needBy)
    platform.backlog.unshift(...providers.map((p) => p.item))
    // Platform plans its own PI after knowing the enablers it owes.
  }

  /** Keep a refined roadmap (not PI-committed) of 2+ sprints so capacity is never idle. */
  private refillRoadmap(tr: TeamRt): void {
    const target = this.velocity(tr) * 2
    let points = tr.backlog.filter((i) => !i.piId || i.piStretch).reduce((s, i) => s + (i.points ?? 0), 0)
    while (points < target) {
      const stories = this.createFeatureWithStories(tr, undefined)
      points += stories.reduce((s, i) => s + (i.points ?? 0), 0)
      tr.backlog.push(...stories)
    }
  }

  private planSprint(tr: TeamRt, k: number): void {
    const ip = isIpIteration(k)
    const id = `${tr.team.key}-S${k + 1}`
    this.emit({
      type: 'iteration.planned',
      iteration: {
        id,
        kind: 'sprint',
        ip: ip || undefined,
        teamId: tr.team.id,
        name: `${tr.team.key} Sprint ${k + 1}${ip ? ' (IP)' : ''}`,
        index: k,
        start: this.now,
        end: workToTime((k + 1) * SPRINT_W),
      },
    })
    // IP iteration: lighter commitment, time reserved for innovation and planning.
    const cap = this.velocity(tr) * this.p.commitFactor * (ip ? this.p.ipCommitShare : 1)
    const committed: ItemRt[] = [...tr.carry]
    let pts = committed.reduce((s, i) => s + (i.points ?? 0), 0)
    let debt = 0
    while (debt < cap * (ip ? this.p.ipInnovationShare : this.p.debtShare)) {
      const task = ip ? this.createInnovation(tr) : this.createTask(tr)
      committed.push(task)
      debt += task.points ?? 0
      pts += task.points ?? 0
    }
    this.refillRoadmap(tr)
    if (!ip && this.rng.chance(this.p.scopeGrowthProb)) {
      const open = tr.features.filter((f) => f.item.status !== 'Done' && f.item.piId === this.piId && !f.item.piStretch)
      if (open.length) {
        const f = this.rng.pick(open)
        const story = this.createStory(tr, this.piId, f.item.id)
        f.stories.push(story)
        // Discovered scope belongs to the commitment: queue it before stretch and roadmap work.
        let at = 0
        tr.backlog.forEach((it, i) => {
          if (it.piId && !it.piStretch) at = i + 1
        })
        tr.backlog.splice(at, 0, story)
      }
    }
    while (pts < cap && tr.backlog.length) {
      const s = tr.backlog.shift()!
      committed.push(s)
      pts += s.points ?? 0
    }
    // Sprint goal: the feature with the most stories in this sprint.
    const perFeature = new Map<string, number>()
    for (const i of committed) if (i.type === 'story' && i.parentId) perFeature.set(i.parentId, (perFeature.get(i.parentId) ?? 0) + 1)
    let goalId: string | undefined
    for (const [fid, n] of perFeature) if (goalId === undefined || n > perFeature.get(goalId)!) goalId = fid
    const goalFeature = goalId ? this.features.get(goalId) : undefined
    const goalItems = goalFeature ? committed.filter((i) => i.parentId === goalFeature.item.id).slice(0, 3) : []
    this.emit({
      type: 'iteration.committed',
      iterationId: id,
      itemIds: committed.map((i) => i.id),
      goalItemIds: goalItems.map((i) => i.id),
      goal: goalFeature ? `Advance ${goalFeature.item.title}` : undefined,
    })
    for (const it of committed) this.assignToSprint(it, id)
    tr.sprint = { id, ip, committed, goalItems, assigned: new Set(committed), completedPoints: 0 }
    // Work in commitment order: carry-over, then tasks, then stories.
    tr.ready = committed.filter((i) => i.status === 'To Do')
    this.tryAssign(tr)
  }

  private closeSprint(tr: TeamRt): void {
    const sp = tr.sprint!
    const goalMet = sp.goalItems.length ? sp.goalItems.every((i) => i.done) : undefined
    this.emit({ type: 'iteration.closed', iterationId: sp.id, goalMet })
    if (!sp.ip) tr.velocityHistory.push(sp.completedPoints) // IP iterations would understate velocity
    tr.carry = [...sp.assigned].filter((i) => !i.done)
    tr.ready = []
    tr.sprint = undefined
  }

  private assignToSprint(it: ItemRt, sprintId: string): void {
    it.sprintId = sprintId
    this.emit({ type: 'item.sprint', itemId: it.id, iterationId: sprintId })
    if (it.status === 'Backlog') this.setStatus(it, 'To Do')
  }

  // ---- item creation --------------------------------------------------------

  private createItem(tr: TeamRt, spec: Omit<NewWorkItem, 'id' | 'teamId'>, rng: Rng = this.rng): ItemRt {
    const id = `${tr.team.key}-${++tr.itemSeq}`
    this.emit({ type: 'item.created', item: { ...spec, id, teamId: tr.team.id } })
    const p = this.p
    const effort =
      spec.type === 'bug'
        ? rng.lognormal(p.bugEffortMedian, p.effortSigma)
        : spec.type === 'task' && spec.points === undefined
          ? rng.lognormal(p.taskEffortMedian, p.effortSigma)
          : rng.lognormal(p.hoursPerPoint * (spec.points ?? 2), p.effortSigma)
    const it: ItemRt = {
      id,
      teamId: tr.team.id,
      type: spec.type,
      title: spec.title,
      points: spec.points,
      parentId: spec.parentId,
      piId: spec.piId,
      piStretch: spec.piStretch,
      status: 'Backlog',
      effort,
      remaining: effort,
      reviewRounds: 0,
      qaRounds: 0,
      randomBlockUsed: false,
      blocked: false,
      openDeps: new Set(),
      done: false,
    }
    this.items.set(id, it)
    return it
  }

  private createFeatureWithStories(tr: TeamRt, piId: string | undefined, piStretch = false): ItemRt[] {
    const feature = this.createFeature(tr, piId, piStretch)
    const count = this.rng.int(3, 6)
    for (let i = 0; i < count; i++) feature.stories.push(this.createStory(tr, piId, feature.item.id, piStretch))
    return feature.stories
  }

  private createFeature(tr: TeamRt, piId: string | undefined, piStretch = false): FeatureRt {
    const names = VOCAB[tr.team.id].features
    const n = tr.featureSeq++
    const round = Math.floor(n / names.length)
    const title = names[n % names.length] + (round ? ` · ${FEATURE_SUFFIXES[(round - 1) % FEATURE_SUFFIXES.length]}${round > FEATURE_SUFFIXES.length ? ` ${Math.ceil(round / FEATURE_SUFFIXES.length)}` : ''}` : '')
    const item = this.createItem(tr, {
      type: 'feature',
      title,
      planned: true,
      piId,
      piStretch: piStretch || undefined,
      flowType: 'feature',
      investment: 'feature',
    })
    const f: FeatureRt = { item, stories: [] }
    this.features.set(item.id, f)
    tr.features.push(f)
    return f
  }

  private createStory(tr: TeamRt, piId: string | undefined, parentId?: string, piStretch = false): ItemRt {
    return this.createItem(tr, {
      piStretch: piStretch || undefined,
      type: 'story',
      title: `${this.rng.pick(STORY_VERBS)} ${this.rng.pick(VOCAB[tr.team.id].objects)}`,
      points: this.rng.weighted(STORY_POINTS),
      planned: true,
      piId,
      parentId,
      flowType: 'feature',
      investment: 'feature',
    })
  }

  private createTask(tr: TeamRt): ItemRt {
    const ktlo = this.rng.chance(0.25)
    return this.createItem(tr, {
      type: 'task',
      title: ktlo
        ? `Maintain ${this.rng.pick(VOCAB[tr.team.id].objects)}`
        : `${this.rng.pick(DEBT_TASKS)} ${this.rng.pick(VOCAB[tr.team.id].objects)}`,
      points: this.rng.weighted([
        [1, 3],
        [2, 4],
        [3, 3],
      ]),
      planned: true,
      flowType: ktlo ? 'risk' : 'debt',
      investment: ktlo ? 'ktlo' : 'debt',
    })
  }

  private createInnovation(tr: TeamRt): ItemRt {
    return this.createItem(tr, {
      type: 'task',
      title: `Innovation: spike on ${this.rng.pick(VOCAB[tr.team.id].objects)}`,
      points: this.rng.weighted([
        [2, 4],
        [3, 4],
        [5, 2],
      ]),
      planned: true,
      flowType: 'feature',
      investment: 'feature',
    })
  }

  private createBug(tr: TeamRt, about?: string): ItemRt {
    const obj = about ?? this.rng.pick(VOCAB[tr.team.id].objects)
    return this.createItem(tr, {
      type: 'bug',
      title: `Fix: ${obj} ${this.rng.pick(BUG_SYMPTOMS)}`,
      planned: false,
      foundIn: 'production',
      flowType: 'defect',
      investment: 'ktlo',
    })
  }

  private unplannedArrival(tr: TeamRt): void {
    const it = this.rng.chance(0.6)
      ? this.createBug(tr)
      : this.createItem(tr, {
          type: 'task',
          title: `Urgent: ${this.rng.pick(VOCAB[tr.team.id].objects)} for a key merchant`,
          planned: false,
          flowType: 'feature',
          investment: 'ktlo',
        })
    this.routeUnplanned(tr, it)
  }

  private kanbanArrival(tr: TeamRt): void {
    const type = this.rng.weighted<WorkItemType>([
      ['story', 60],
      ['task', 25],
      ['bug', 15],
    ])
    const expedite = this.rng.chance(this.p.expediteShare)
    const obj = this.rng.pick(VOCAB[tr.team.id].objects)
    const flow: Record<string, [FlowType, Investment, string]> = {
      story: ['feature', 'feature', `${this.rng.pick(STORY_VERBS)} ${obj}`],
      task: ['debt', 'debt', `${this.rng.pick(DEBT_TASKS)} ${obj}`],
      bug: ['defect', 'ktlo', `Fix: ${obj} ${this.rng.pick(BUG_SYMPTOMS)}`],
    }
    const [flowType, investment, title] = flow[type]
    const it = this.createItem(tr, {
      type,
      title,
      planned: !expedite,
      flowType,
      investment,
      // Expedited merchant bugs come from production; the rest are found internally.
      foundIn: type === 'bug' ? (expedite ? 'production' : 'internal') : undefined,
    })
    if (expedite) this.routeUnplanned(tr, it)
    else {
      tr.backlog.push(it)
      this.tryAssign(tr)
    }
  }

  private routeUnplanned(tr: TeamRt, it: ItemRt): void {
    if (tr.sprint) {
      this.assignToSprint(it, tr.sprint.id)
      tr.sprint.assigned.add(it)
    }
    tr.urgent.push(it)
    this.tryAssign(tr)
  }

  // ---- work -----------------------------------------------------------------

  private setStatus(it: ItemRt, to: StatusName): void {
    if (it.status === to) return
    it.status = to
    if (to === 'In Progress' && it.firstActiveAt === undefined) it.firstActiveAt = this.now
    this.emit({ type: 'item.status', itemId: it.id, to })
  }

  private tryAssign(tr: TeamRt): void {
    if (tr.assigning) return
    tr.assigning = true
    for (const dev of tr.devs) {
      while (!dev.item && !dev.away) {
        const it = this.nextFor(tr)
        if (!it) break
        this.startWork(tr, dev, it)
      }
    }
    tr.assigning = false
  }

  private nextFor(tr: TeamRt): ItemRt | undefined {
    // An item can sit in more than one queue (e.g. unplanned work carried over
    // into the next sprint), so check it is still waiting for exactly this.
    const waiting = (it: ItemRt, statuses: StatusName[]) => !it.done && !it.blocked && !it.dev && statuses.includes(it.status)
    while (tr.resume.length) {
      const it = tr.resume.shift()!
      if (waiting(it, ['In Progress'])) return it
    }
    for (const q of [tr.urgent, tr.ready]) {
      while (q.length) {
        const it = q.shift()!
        if (waiting(it, ['Backlog', 'To Do'])) return it
      }
    }
    if (tr.team.method === 'kanban') return tr.backlog.shift()
    if (tr.sprint && tr.backlog.length) {
      // Pull ahead: the sprint commitment is started, so take the next story.
      const it = tr.backlog.shift()!
      this.assignToSprint(it, tr.sprint.id)
      tr.sprint.assigned.add(it)
      return it
    }
    return undefined
  }

  private startWork(tr: TeamRt, dev: DevRt, it: ItemRt): void {
    dev.item = it
    it.dev = dev
    this.setStatus(it, 'In Progress')
    if (it.parentId) {
      const f = this.features.get(it.parentId)
      if (f && f.item.status === 'Backlog') this.setStatus(f.item, 'In Progress')
    }
    if (it.openDeps.size) {
      this.block(tr, it, 'dependency', [...it.openDeps][0])
      return
    }
    let chunk = it.remaining
    let blockAfter = false
    if (!it.randomBlockUsed && this.rng.chance(this.p.blockProb)) {
      it.randomBlockUsed = true
      blockAfter = true
      chunk = it.remaining * this.rng.uniform(0.1, 0.9)
    }
    this.afterWork(chunk / this.p.focus, () => {
      it.remaining -= chunk
      if (blockAfter) {
        this.block(tr, it, 'external')
        this.afterWork(this.rng.lognormal(this.p.blockMedian, this.p.blockSigma), () => this.unblock(tr, it))
      } else {
        this.devDone(tr, it)
      }
    })
  }

  private release(it: ItemRt): void {
    if (it.dev) it.dev.item = undefined
    it.dev = undefined
  }

  private block(tr: TeamRt, it: ItemRt, reason: 'dependency' | 'external', dependencyId?: string): void {
    it.blocked = true
    it.blockedOnDep = dependencyId
    this.emit({ type: 'item.blocked', itemId: it.id, reason, dependencyId })
    this.release(it)
    this.tryAssign(tr)
  }

  private unblock(tr: TeamRt, it: ItemRt): void {
    if (!it.blocked) return
    it.blocked = false
    it.blockedOnDep = undefined
    this.emit({ type: 'item.unblocked', itemId: it.id })
    tr.resume.push(it)
    this.tryAssign(tr)
  }

  private devDone(tr: TeamRt, it: ItemRt): void {
    const p = this.p
    const dev = it.dev
    this.release(it)
    if (dev) {
      dev.away = true
      this.afterWork(this.rng.lognormal(p.devGapMedian, 0.8), () => {
        dev.away = false
        this.tryAssign(tr)
      })
    }
    if (!it.mrId) {
      const id = `MR-${++this.seq.mr}`
      it.mrId = id
      const lead = addWorkingHours(this.now, -this.rng.lognormal(p.firstCommitLeadMedian, 0.6))
      const size = Math.max(5, Math.round(this.rng.lognormal(110, 0.8)))
      const aiAssisted = this.rng.chance(0.4)
      this.mrAi.set(id, aiAssisted)
      this.emit({
        type: 'mr.opened',
        mr: {
          id,
          itemId: it.id,
          teamId: tr.team.id,
          firstCommitAt: Math.max(lead, it.firstActiveAt ?? lead),
          size,
          aiAssisted,
        },
      })
    }
    this.setStatus(it, 'Ready for Review')
    const pickup = this.rng.lognormal(p.reviewPickupMedian * (it.reviewRounds ? 0.6 : 1), p.reviewPickupSigma)
    this.afterWork(pickup, () => this.startReview(tr, it))
    this.tryAssign(tr)
  }

  private startReview(tr: TeamRt, it: ItemRt): void {
    const mrId = it.mrId!
    this.emit({ type: 'mr.review.started', mrId })
    this.setStatus(it, 'In Review')
    this.afterWork(this.rng.lognormal(this.p.reviewDurationMedian, 0.6), () => this.finishReview(tr, it, mrId))
  }

  private finishReview(tr: TeamRt, it: ItemRt, mrId: string): void {
    const p = this.p
    const pChanges = it.reviewRounds ? p.changesRequestedAgainProb : p.changesRequestedProb
    it.reviewRounds++
    if (this.rng.chance(pChanges)) {
      this.emit({ type: 'mr.reviewed', mrId, outcome: 'changes' })
      this.setStatus(it, 'In Progress')
      it.remaining = it.effort * this.rng.uniform(...p.reworkShare)
      tr.resume.push(it)
      this.tryAssign(tr)
      return
    }
    this.emit({ type: 'mr.reviewed', mrId, outcome: 'approved' })
    this.afterMinutes(this.rng.uniform(2, 15), () => {
      this.emit({ type: 'mr.merged', mrId })
      this.setStatus(it, 'Ready for QA')
      this.runPipeline(tr, { mrId })
      this.afterWork(this.rng.lognormal(p.qaPickupMedian, p.qaPickupSigma), () => {
        tr.qaQueue.push(it)
        this.tryQa(tr)
      })
    })
  }

  private tryQa(tr: TeamRt): void {
    while (tr.qaFree > 0 && tr.qaQueue.length) {
      const it = tr.qaQueue.shift()!
      tr.qaFree--
      this.setStatus(it, 'In QA')
      this.afterWork(this.rng.lognormal(this.p.qaEffortMedian, 0.6), () => {
        tr.qaFree++
        if (it.qaRounds++ === 0 && this.rng.chance(this.p.qaFailProb)) {
          this.setStatus(it, 'In Progress')
          it.remaining = it.effort * this.rng.uniform(0.15, 0.35)
          it.mrId = undefined // the fix goes in a new MR
          tr.resume.push(it)
          this.tryAssign(tr)
        } else {
          this.complete(tr, it)
        }
        this.tryQa(tr)
      })
    }
  }

  private complete(tr: TeamRt, it: ItemRt): void {
    this.setStatus(it, 'Done')
    it.done = true
    if (tr.sprint && it.sprintId === tr.sprint.id) tr.sprint.completedPoints += it.points ?? 0
    for (const dep of this.providerDeps.get(it.id) ?? []) {
      this.emit({ type: 'dependency.resolved', dependencyId: dep.id })
      dep.consumer.openDeps.delete(dep.id)
      if (dep.consumer.blockedOnDep === dep.id) this.unblock(this.byTeam.get(dep.consumer.teamId)!, dep.consumer)
    }
    this.providerDeps.delete(it.id)
    if (it.parentId) {
      const f = this.features.get(it.parentId)
      if (f && f.stories.every((s) => s.done)) {
        this.setStatus(f.item, 'Done')
        this.checkMilestones()
      }
    }
    if (!it.escapeRolled) {
      it.escapeRolled = true
      if (it.type !== 'task' && this.rng.chance(this.p.escapeProb)) {
        const obj = VOCAB[tr.team.id].objects.find((o) => it.title.includes(o))
        this.afterWork(this.rng.lognormal(16, 1), () => this.routeUnplanned(tr, this.createBug(tr, obj)))
      }
    }
    // A small share of finished work is reopened (found not done after all).
    if (!it.reopened && this.ops.chance(this.p.reopenProb)) {
      it.reopened = true
      this.afterWork(this.ops.lognormal(10, 0.8), () => {
        it.done = false
        this.setStatus(it, 'In Progress')
        it.remaining = it.effort * this.ops.uniform(0.1, 0.3)
        it.mrId = undefined
        it.qaRounds = 1
        tr.resume.push(it)
        this.tryAssign(tr)
      })
    }
  }

  // ---- CI, deployments, incidents -------------------------------------------

  private runPipeline(
    tr: TeamRt,
    opts: { mrId?: string; retryOf?: string; fixFor?: string[] },
  ): void {
    const p = this.p
    const id = `CI-${++this.seq.run}`
    const startedAt = this.now
    const r = this.rng.next()
    const outcome =
      opts.retryOf || opts.fixFor ? 'success' : r < p.flakyProb ? 'flaky' : r < p.flakyProb + p.mainFailProb ? 'failed' : 'success'
    const minutes = this.rng.lognormal(p.pipelineMedianMin, p.pipelineSigma)
    this.afterMinutes(minutes, () => {
      this.emit({
        type: 'pipeline.finished',
        run: {
          id,
          teamId: tr.team.id,
          branch: 'main',
          mrId: opts.mrId,
          startedAt,
          result: outcome === 'success' ? 'success' : 'failed',
          retryOf: opts.retryOf,
        },
      })
      if (outcome === 'flaky') {
        this.runPipeline(tr, { mrId: opts.mrId, retryOf: id })
      } else if (outcome === 'failed') {
        tr.mainRed = true
        const broken = opts.mrId ? [opts.mrId] : []
        this.afterWork(this.rng.lognormal(p.fixMedian, 0.6), () => this.runPipeline(tr, { fixFor: broken }))
      } else {
        if (opts.fixFor) {
          tr.mainRed = false
          tr.pendingDeploy.push(...opts.fixFor)
        }
        if (opts.mrId) tr.pendingDeploy.push(opts.mrId)
      }
    })
  }

  private deploy(tr: TeamRt): void {
    if (!tr.pendingDeploy.length || tr.mainRed) return
    const id = `DEP-${++this.seq.deploy}`
    const mrIds = tr.pendingDeploy.splice(0)
    this.emit({ type: 'deployment', deployment: { id, teamId: tr.team.id, service: tr.team.service, mrIds, kind: 'regular' } })
    if (this.rng.chance(this.p.changeFailureProb)) this.failedDeployment(tr, id, mrIds)
  }

  private failedDeployment(tr: TeamRt, deploymentId: string, mrIds: string[]): void {
    const p = this.p
    const id = `INC-${++this.seq.incident}`
    const startedAt = this.now
    const sev = this.rng.weighted<1 | 2 | 3 | 4>([
      [1, 5],
      [2, 25],
      [3, 50],
      [4, 20],
    ])
    tr.openIncidents++
    const outage: { service: string; sev: 1 | 2 | 3 | 4; startedAt: number; resolvedAt?: number } = { service: tr.team.service, sev, startedAt }
    this.outages.push(outage)
    // Postmortem attribution: the culprit change, AI-assisted changes weighted by the profile.
    const causeMrId = mrIds.length
      ? this.obs.weighted(mrIds.map((m) => [m, this.mrAi.get(m) ? p.aiCulpritWeight : 1] as const))
      : undefined
    const hotfix = this.ops.chance(p.hotfixShare)
    this.afterMinutes(this.rng.lognormal(p.detectMedianMin, 0.6), () => {
      this.emit({
        type: 'incident.opened',
        incident: { id, teamId: tr.team.id, service: tr.team.service, sev, title: `errors after deploy on ${tr.team.service}`, startedAt, deploymentId, causeMrId },
      })
      this.afterMinutes(this.rng.lognormal(p.ackMedianMin, 0.7), () => {
        this.emit({ type: 'incident.acked', incidentId: id })
        this.afterMinutes(this.rng.lognormal(p.recoveryMedianMin, p.recoverySigma), () => {
          this.emit({
            type: 'deployment',
            deployment: { id: `DEP-${++this.seq.deploy}`, teamId: tr.team.id, service: tr.team.service, mrIds: [], kind: hotfix ? 'hotfix' : 'rollback' },
          })
          this.afterMinutes(this.rng.uniform(2, 8), () => {
            this.emit({ type: 'incident.resolved', incidentId: id })
            outage.resolvedAt = this.now
            tr.openIncidents--
            this.routeUnplanned(tr, this.createBug(tr, `regression from ${deploymentId}:`))
            if (sev <= 2) this.schedulePostmortem(tr, id)
          })
        })
      })
    })
  }

  private randomIncident(): void {
    const tr = this.rng.pick(this.teams)
    const id = `INC-${++this.seq.incident}`
    const startedAt = this.now
    const sev = this.rng.weighted<3 | 4>([
      [3, 60],
      [4, 40],
    ])
    const what = this.rng.pick(['latency spike', 'elevated error rate', 'queue backlog', 'degraded dependency'])
    const outage: { service: string; sev: 1 | 2 | 3 | 4; startedAt: number; resolvedAt?: number } = { service: tr.team.service, sev, startedAt }
    this.outages.push(outage)
    this.afterMinutes(this.rng.lognormal(10, 0.6), () => {
      this.emit({ type: 'incident.opened', incident: { id, teamId: tr.team.id, service: tr.team.service, sev, title: `${what} on ${tr.team.service}`, startedAt } })
      this.afterMinutes(this.rng.lognormal(5, 0.7), () => {
        this.emit({ type: 'incident.acked', incidentId: id })
        this.afterMinutes(this.rng.lognormal(60, 0.9), () => {
          this.emit({ type: 'incident.resolved', incidentId: id })
          outage.resolvedAt = this.now
        })
      })
    })
  }

  // ---- Stage 2: postmortems, milestones, objectives, risks, SLI, surveys -----

  private schedulePostmortem(tr: TeamRt, incidentId: string): void {
    this.afterWork(this.ops.lognormal(6, 0.5), () => {
      const n = this.ops.int(2, 4)
      const actions: ItemRt[] = []
      for (let i = 0; i < n; i++) {
        actions.push(
          this.createItem(
            tr,
            {
              type: 'task',
              title: `Postmortem ${incidentId}: ${this.ops.pick(POSTMORTEM_ACTIONS)}`,
              points: this.ops.int(1, 2),
              planned: true,
              flowType: 'risk',
              investment: 'ktlo',
              postmortemOf: incidentId,
            },
            this.ops,
          ),
        )
      }
      this.emit({ type: 'incident.postmortem', incidentId, actionItemIds: actions.map((a) => a.id) })
      tr.backlog.unshift(...actions) // next planning (or next free Kanban dev) picks them up first
      if (tr.team.method === 'kanban') this.tryAssign(tr)
    })
  }

  private planPiExtras(n: number): void {
    const piId = `PI-${n + 1}`
    const startW = n * PI_W
    const committed = (tr: TeamRt) => tr.features.filter((f) => f.item.piId === piId && !f.item.piStretch)
    const streams = this.scrumTeams.filter((t) => t.team.kind === 'stream')
    const plan = (name: string, dueW: number, features: FeatureRt[]) => {
      if (!features.length) return
      const id = `MS-${++this.seq.ms}`
      this.milestonesRt.push({ id, features, achieved: false })
      this.emit({
        type: 'milestone.planned',
        milestone: { id, name: `PI ${n + 1} · ${name}`, piId, due: workToTime(dueW), featureIds: features.map((f) => f.item.id) },
      })
    }
    plan('Beta', startW + 3 * SPRINT_W, streams.flatMap((t) => committed(t).slice(0, 1)))
    plan('Release', startW + DEV_ITERATIONS_PER_PI * SPRINT_W, this.scrumTeams.flatMap((t) => committed(t).slice(0, 2)))
    // PI objectives with business value (committed and uncommitted).
    this.objectivesRt = []
    for (const tr of this.scrumTeams) {
      for (const f of tr.features.filter((f) => f.item.piId === piId)) {
        const id = `OBJ-${++this.seq.obj}`
        const plannedBv = this.obs.weighted([
          [3, 1],
          [5, 2],
          [7, 3],
          [8, 3],
          [10, 2],
        ] as const)
        this.objectivesRt.push({ id, feature: f, plannedBv })
        this.emit({
          type: 'objective.planned',
          objective: { id, piId, teamId: tr.team.id, featureId: f.item.id, title: f.item.title, committed: !f.item.piStretch, plannedBv },
        })
      }
    }
    // Program risks raised at PI planning.
    const count = 3 + this.obs.int(0, 2)
    for (let i = 0; i < count; i++) this.raiseRisk(piId)
    this.checkMilestones()
  }

  private checkMilestones(): void {
    for (const m of this.milestonesRt) {
      if (!m.achieved && m.features.every((f) => f.item.status === 'Done')) {
        m.achieved = true
        this.emit({ type: 'milestone.achieved', milestoneId: m.id })
      }
    }
  }

  /** Business Owners score the PI objectives at the end of the PI (Inspect & Adapt). */
  private scoreObjectives(): void {
    for (const o of this.objectivesRt) {
      const done = o.feature.item.status === 'Done'
      const share = o.feature.stories.length ? o.feature.stories.filter((s) => s.done).length / o.feature.stories.length : 0
      // Business Owners rarely award full value; partial features earn little.
      const actual = done ? o.plannedBv * this.obs.uniform(0.65, 0.9) : o.plannedBv * share * this.obs.uniform(0.3, 0.6)
      this.emit({ type: 'objective.scored', objectiveId: o.id, actualBv: Math.round(actual * 10) / 10 })
    }
    this.objectivesRt = []
  }

  private raiseRisk(piId: string | undefined): void {
    const id = `RISK-${++this.seq.risk}`
    const probability = Math.round(this.obs.uniform(0.1, 0.6) * 100) / 100
    const impact = Math.round(this.obs.lognormal(15, 0.6))
    const owner = this.obs.pick(this.teams)
    this.risksRt.set(id, { p: probability, impact })
    this.emit({
      type: 'risk.raised',
      risk: { id, title: `${this.obs.pick(RISK_TITLES)} (${owner.team.key})`, probability, impact, ownerTeamId: owner.team.id, piId },
    })
  }

  /** Every iteration boundary: risk review, cost entries, surveys (observational only). */
  private observeBoundary(k: number): void {
    for (const [id, r] of this.risksRt) {
      if (this.obs.chance(0.14)) {
        this.risksRt.delete(id)
        this.emit({ type: 'risk.closed', riskId: id, outcome: 'mitigated' })
      } else if (this.obs.chance(r.p * 0.12)) {
        this.risksRt.delete(id)
        this.emit({ type: 'risk.closed', riskId: id, outcome: 'occurred' })
      } else {
        r.p = Math.round(Math.min(0.9, Math.max(0.05, r.p * this.obs.uniform(0.75, 1.05))) * 100) / 100
        r.impact = Math.round(r.impact * this.obs.uniform(0.95, 1.1))
        this.emit({ type: 'risk.updated', riskId: id, probability: r.p, impact: r.impact })
      }
    }
    if (k % ITERATIONS_PER_PI !== 0 && this.obs.chance(0.4)) this.raiseRisk(this.piId)
    if (k === 0) return
    for (const tr of this.teams) {
      const people = tr.team.devs + tr.team.qa
      this.emit({
        type: 'cost.entry',
        cost: { id: `COST-${++this.seq.cost}`, teamId: tr.team.id, amount: Math.round(people * 2 * this.p.costPerPersonWeek * this.obs.lognormal(1, 0.03) * 10) / 10, category: 'people' },
      })
      this.emit({
        type: 'cost.entry',
        cost: { id: `COST-${++this.seq.cost}`, teamId: tr.team.id, amount: Math.round(this.obs.lognormal(3, 0.2) * 10) / 10, category: 'tooling' },
      })
      if (k % 2 === 0) {
        this.emit({
          type: 'survey.snapshot',
          survey: { id: `SRV-${++this.seq.survey}`, teamId: tr.team.id, instrument: 'DXI', score: Math.round(Math.min(100, Math.max(0, 72 + this.obs.normal() * 3)) * 10) / 10, responses: people - this.obs.int(0, 1) },
        })
      }
      if (k % ITERATIONS_PER_PI === 0) {
        this.emit({
          type: 'survey.snapshot',
          survey: { id: `SRV-${++this.seq.survey}`, teamId: tr.team.id, instrument: 'eNPS', score: Math.round(Math.min(100, Math.max(-100, 35 + this.obs.normal() * 8))), responses: people - this.obs.int(0, 1) },
        })
      }
    }
    if (k % 2 === 0) {
      this.emit({ type: 'value.snapshot', value: { id: `VAL-${++this.seq.value}`, measure: 'csat', value: Math.round((4.3 + this.obs.normal() * 0.08) * 100) / 100 } })
    }
  }

  /** Hourly service level indicators, 24/7: requests and failed requests per service. */
  private sliTick(start: number): void {
    const end = start + HOUR_MS
    const hour = new Date(start).getUTCHours()
    const dow = new Date(start).getUTCDay()
    const diurnal = (hour >= 7 && hour < 22 ? 1 : 0.35) * (dow === 0 || dow === 6 ? 0.7 : 1)
    const windows = this.teams.map((tr) => {
      const total = Math.round(SERVICE_TRAFFIC[tr.team.id] * diurnal * this.sliRng.lognormal(1, 0.08))
      let rate = this.p.sliBaseErrorRate * this.sliRng.lognormal(1, 0.4)
      for (const o of this.outages) {
        if (o.service !== tr.team.service) continue
        const overlap = Math.min(end, o.resolvedAt ?? end) - Math.max(start, o.startedAt)
        if (overlap > 0) rate += (overlap / HOUR_MS) * this.p.sliSevErrorRate[o.sev]
      }
      return { service: tr.team.service, teamId: tr.team.id, start, total, bad: Math.min(total, Math.round(total * rate)) }
    })
    this.emit({ type: 'sli.windows', windows })
    // Drop outages resolved more than an hour ago.
    for (let i = this.outages.length - 1; i >= 0; i--) {
      const r = this.outages[i].resolvedAt
      if (r !== undefined && r < start) this.outages.splice(i, 1)
    }
    this.at(end + HOUR_MS, () => this.sliTick(end))
  }
}

/** Convenience for tests and the worker: the full pre-filled history. */
export function simulateHistory(seed = DEFAULT_SEED, untilW: number): { sim: Simulator; events: SimEvent[] } {
  const sim = new Simulator(seed)
  const events = sim.advanceToWork(untilW)
  return { sim, events }
}
