// Stage 3a: the content layer (catalog, articles, symptoms, sources) joined
// with the registry, the SYNTHETIC series, the Library and the calculators.

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import contentSources from '../../content/sources.yaml'
import { parseHash, routeHash, type Route } from '../app/route'
import { CATALOG_SWITCHABLE, defaultOn, EMPTY_LIBRARY, exportJson, importJson, metricOn, normalize, symptomOn, switchable } from '../app/library'
import { SAFE_FLOW } from '../app/safeFlow'
import { buildStore } from '../domain/store'
import { METRICS, SOURCES } from '../metrics/registry'
import { SPRINT_W } from '../sim/calendar'
import { DEFAULT_SEED, Simulator } from '../sim/simulator'
import { SYNTHETIC_DEFS, syntheticValue, teamSeries } from '../synthetic/series'
import { SYNTH_SPECS } from '../synthetic/specs'
import { ARTICLES, CALCULATORS, OPTIONAL_SECTIONS, ROLES, SECTION_ORDER } from './articles'
import { cyclePercentiles, monteCarloWeeks, parseNumbers, sayDo } from './calculators'
import { CATALOG, CATALOG_BY_ID, CATALOG_TO_REGISTRY, catalogEntry, isGeneratedSynthetic, isPendingLive, LIVE_PANELS, resolveId } from './catalog'
import { blocks, inline, plain, sections, splitFrontMatter } from './markdown'
import { PLAYBOOKS, SYMPTOMS } from './symptoms'

const rawCatalog = import.meta.glob<string>('../../content/catalog.yaml', { query: '?raw', import: 'default', eager: true })

describe('catalog (content/catalog.yaml)', () => {
  it('has unique ids and valid fields', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(170)
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length)
    for (const e of CATALOG) {
      expect([1, 2, 3, 4], e.id).toContain(e.tier)
      expect(['live', 'featured', 'synthetic', 'view', 'anti'], e.id).toContain(e.status)
      expect(e.levels.length, e.id).toBeGreaterThan(0)
      for (const l of e.levels) expect(['lagging', 'current', 'leading'], e.id).toContain(l)
      expect(e.q, e.id).toBeTruthy()
      if (e.status === 'anti') expect(e.tab, e.id).toBeUndefined()
      else expect(e.tab, e.id).toBeTruthy()
      for (const a of e.aliases) expect(['≡', '≈'], e.id).toContain(a.rel)
    }
  })

  it('every registry metric is in the catalog; the registry wins on id (content/README.md)', () => {
    for (const m of METRICS) expect(CATALOG_BY_ID.get(m.id)?.def, m.id).toBe(m)
    for (const [cat, reg] of Object.entries(CATALOG_TO_REGISTRY)) {
      expect(rawCatalog['../../content/catalog.yaml'], cat).toContain(`id: ${cat}`)
      expect(METRICS.map((m) => m.id), reg).toContain(reg)
      expect(catalogEntry(cat)?.id).toBe(reg)
    }
  })

  it('a live catalog entry is computed, a panel, or explicitly "not computed yet"', () => {
    const pending = CATALOG.filter(isPendingLive).map((e) => e.id).sort()
    // ⚠ open question for Dmitry (docs/stage-3a.md): listed as live, but no registry definition yet.
    expect(pending).toEqual(['epic-lead-time', 'feature-lead-time', 'portfolio-wip', 'wsjf'])
    for (const id of LIVE_PANELS) expect(catalogEntry(id)?.status).toBe('live')
  })

  it('views are the charts the app knows how to draw', () => {
    expect(CATALOG.filter((e) => e.status === 'view').map((e) => e.id).sort()).toEqual(
      ['burnup-forecast', 'cumulative-flow', 'cycle-time-scatterplot', 'risk-burndown', 'sprint-burndown', 'sprint-burnup'],
    )
  })
})

describe('SYNTHETIC series (own RNG streams)', () => {
  it('every synthetic / featured catalog metric the simulator does not produce has a spec, and nothing else', () => {
    const generated = CATALOG.filter(isGeneratedSynthetic).map((e) => e.id).sort()
    expect(Object.keys(SYNTH_SPECS).sort()).toEqual(generated)
    expect(SYNTHETIC_DEFS.map((d) => d.id).sort()).toEqual(generated)
    for (const d of SYNTHETIC_DEFS) {
      expect(d.synthetic && d.generated?.prodSource, d.id).toBeTruthy()
      expect(d.target.op, d.id).toBeUndefined() // never coloured
    }
  })

  it('anti-metrics are never tiles', () => {
    for (const e of CATALOG.filter((x) => x.status === 'anti')) {
      expect(SYNTHETIC_DEFS.some((d) => d.id === e.id)).toBe(false)
      expect(METRICS.some((d) => d.id === e.id)).toBe(false)
      expect(switchable(e)).toBe(false)
      expect(metricOn(normalize({ metrics: { [e.id]: true } }), e.id)).toBe(false)
    }
  })

  it('is deterministic, stays in range and keeps the requested cadence', () => {
    for (const [id, s] of Object.entries(SYNTH_SPECS)) {
      const a = teamSeries(id, 2, 150)
      expect(teamSeries(id, 2, 150), id).toEqual(a)
      expect(teamSeries(id, 3, 150), id).not.toEqual(a)
      for (const v of a) {
        expect(Number.isFinite(v), id).toBe(true)
        if (s.min !== undefined) expect(v, id).toBeGreaterThanOrEqual(s.min)
        if (s.max !== undefined) expect(v, id).toBeLessThanOrEqual(s.max)
      }
      if (s.every && s.every > 1) expect(a[1], id).toBe(a[0])
    }
  })

  it('aggregates teams: counts add up, everything else is the median', () => {
    const t = Date.UTC(2026, 6, 1)
    const per = [0, 1, 2].map((k) => syntheticValue('pr-throughput', [k], t)!)
    expect(syntheticValue('pr-throughput', [0, 1, 2], t)).toBe(per[0] + per[1] + per[2])
    const p = [0, 1, 2].map((k) => syntheticValue('dod-compliance', [k], t)!).sort((a, b) => a - b)
    expect(syntheticValue('dod-compliance', [0, 1, 2], t)).toBe(p[1])
  })

  it('does not touch the simulator: the event log is identical with or without synthetic generation', () => {
    const before = JSON.stringify(new Simulator(DEFAULT_SEED).advanceToWork(SPRINT_W))
    const sim = new Simulator(DEFAULT_SEED)
    const store = buildStore(sim.advanceToWork(SPRINT_W / 2))
    for (const d of SYNTHETIC_DEFS) d.compute({ store, asOf: Date.UTC(2026, 4, 1), teamIds: store.teams.map((x) => x.id), windowDays: 28 })
    const rest = sim.advanceToWork(SPRINT_W)
    const after = JSON.stringify([...new Simulator(DEFAULT_SEED).advanceToWork(SPRINT_W / 2), ...rest])
    expect(after).toBe(before)
  })
})

describe('articles (content/articles)', () => {
  it.each(ARTICLES.map((a) => [a.fileId, a] as const))('%s follows content/README.md', (_, a) => {
    const entry = catalogEntry(a.id)
    expect(entry, 'catalog entry').toBeTruthy()
    expect(a.tier, 'tier matches the catalog').toBe(entry!.tier)
    for (const r of a.roles) expect(ROLES.map((x) => x.id)).toContain(r)
    expect(a.answers.length).toBeGreaterThan(0)
    for (const k of a.sourceKeys) expect(SOURCES[k], `source ${k}`).toBeTruthy()
    for (const r of a.readWith) expect(catalogEntry(r.id), `read_with ${r.id}`).toBeTruthy()
    if (a.calculator) expect(CALCULATORS).toContain(a.calculator)
    for (const f of a.flags) expect(f).toMatch(/^⚠/)
    // Fixed sections, always in this order; optional ones after.
    const titles = a.sections.map((s) => s.title)
    expect(titles.slice(0, SECTION_ORDER.length)).toEqual([...SECTION_ORDER])
    for (const t of titles.slice(SECTION_ORDER.length)) expect(OPTIONAL_SECTIONS as readonly string[]).toContain(t)
  })

  it('calculators exist only where an article asks for one (cycle-percentiles, say-do, monte-carlo)', () => {
    expect(ARTICLES.filter((a) => a.calculator).map((a) => a.calculator).sort()).toEqual(['cycle-percentiles', 'monte-carlo', 'say-do'])
  })
})

describe('symptoms (content/symptoms)', () => {
  it('lists all 42 with unique ids', () => {
    expect(SYMPTOMS).toHaveLength(42)
    expect(new Set(SYMPTOMS.map((s) => s.id)).size).toBe(42)
  })

  it.each(PLAYBOOKS.map((p) => [p.id, p] as const))('%s: references resolve', (id, p) => {
    expect(SYMPTOMS.map((s) => s.id)).toContain(id)
    for (const s of [...p.earlySignals, ...p.confirmingSignals]) {
      expect(catalogEntry(s.id), `signal ${s.id}`).toBeTruthy()
      expect(s.lookFor).toBeTruthy()
    }
    for (const e of p.evidence) for (const k of e.sourceKeys) expect(SOURCES[k], `source ${k}`).toBeTruthy()
    expect(p.playbook.now.length).toBeGreaterThan(0)
    for (const f of p.flags) expect(f).toMatch(/^⚠/)
  })

  it('review-bottleneck signals resolve to live metrics (queue-size-by-stage → queue-size)', () => {
    const p = PLAYBOOKS.find((x) => x.id === 'review-bottleneck')!
    expect(p.earlySignals.map((s) => s.id)).toEqual(['queue-size', 'pr-pickup-time', 'aging-wip'])
    for (const s of [...p.earlySignals, ...p.confirmingSignals]) expect(catalogEntry(s.id)?.def, s.id).toBeTruthy()
  })
})

describe('sources: content/sources.yaml merged into registry/sources.yaml', () => {
  it('every content source is in the registry with the same url and check date', () => {
    for (const [k, s] of Object.entries(contentSources as Record<string, { url: string; checked: string; year?: number }>)) {
      expect(SOURCES[k], k).toBeTruthy()
      expect(SOURCES[k].url, k).toBe(s.url)
      expect(String(SOURCES[k].checked), k).toBe(String(s.checked))
      if (s.year) expect(SOURCES[k].year, k).toBe(s.year)
    }
    expect(SOURCES['vacanti-wwibd'].year).toBe(2020)
  })
})

describe('Library', () => {
  it('defaults: live and featured on, synthetic off, CFD and scatterplot on, anti never', () => {
    const on = (id: string) => metricOn(EMPTY_LIBRARY, id)
    expect(on('cycle-time')).toBe(true)
    expect(on('dxi')).toBe(true)
    expect(on('safe-competency')).toBe(true)
    expect(on('arrival-rate')).toBe(false)
    expect(on('cumulative-flow')).toBe(true)
    expect(on('sprint-burndown')).toBe(false)
    expect(on('lines-of-code')).toBe(false)
    expect(on('pi-objectives-status')).toBe(true)
    expect(on('wsjf')).toBe(false)
    expect(symptomOn(EMPTY_LIBRARY, 'review-bottleneck')).toBe(true)
  })

  it('stores only real overrides and round-trips through JSON', () => {
    const lib = normalize({
      metrics: { 'arrival-rate': true, 'cycle-time': false, throughput: true, 'lines-of-code': true, nope: true, wip: 'yes' },
      symptoms: { 'fat-tail': false, 'review-bottleneck': true, nope: false },
    })
    expect(lib).toEqual({ metrics: { 'arrival-rate': true, 'cycle-time': false }, symptoms: { 'fat-tail': false } })
    const json = exportJson(lib, new Date('2026-10-01T00:00:00Z'))
    expect(JSON.parse(json)).toMatchObject({ kind: 'delivery-pulse/library', version: 1, exportedAt: '2026-10-01T00:00:00.000Z' })
    expect(importJson(json)).toEqual(lib)
    expect(() => importJson('{')).toThrow(/JSON/)
    expect(() => importJson('{"metrics":{}}')).toThrow(/Delivery Pulse/)
  })

  it('every switchable entry has a default', () => {
    for (const e of CATALOG_SWITCHABLE) expect(typeof defaultOn(e)).toBe('boolean')
  })
})

describe('Scale: the six SAFe flow metrics under SAFe names, same computations', () => {
  it('maps to existing registry metrics via aka.safe', () => {
    expect(SAFE_FLOW.map((d) => d.aka!.safe!.name)).toEqual([
      'Flow Distribution',
      'Flow Velocity',
      'Flow Time',
      'Flow Load',
      'Flow Efficiency',
      'Flow Predictability',
    ])
    for (const d of SAFE_FLOW) expect(METRICS).toContain(d)
  })
})

describe('calculators — the articles’ worked examples', () => {
  it('cycle-percentiles (cycle-time article): P50 3, P85 9, mean 5.6 above 7 of 10', () => {
    const r = cyclePercentiles(parseNumbers('1, 2, 2, 3, 3, 4, 5, 6, 9, 21'))!
    expect(r.p50).toBe(3)
    expect(r.p85).toBe(9)
    expect(r.p85Rank).toBe(9)
    expect(r.mean).toBeCloseTo(5.6, 5)
    expect(r.belowMean).toBe(7)
  })

  it('say-do (say-do-ratio article): 34 of 40 planned → 85 %, inside the corridor', () => {
    const r = sayDo(40, 34)!
    expect(r.ratio).toBe(85)
    expect(r.reading).toMatch(/corridor/)
    expect(sayDo(40, 39)!.reading).toMatch(/sandbagging/)
    expect(sayDo(40, 20)!.reading).toMatch(/over-commitment/)
    expect(sayDo(0, 1)).toBeNull()
  })

  it('monte-carlo (pi-forecast article): P50 5 weeks, P85 6 weeks; exact odds 31.2 / 81.2 / 98.0 %', () => {
    const r = monteCarloWeeks([3, 5, 4, 6, 2, 5, 4, 7], 20)!
    expect(r.p50).toBe(5)
    expect(r.p85).toBe(6)
    // Exact by convolution: P(sum of 4 weeks ≥ 20) = 31.2 %, 5 weeks 81.2 %, 6 weeks 98.0 %.
    // ⚠ The article says "about 83 %" and "about 99 %" (docs/stage-3a.md).
    expect(Math.abs(r.within(4) - 31.2)).toBeLessThan(1.5)
    expect(Math.abs(r.within(5) - 81.2)).toBeLessThan(1.5)
    expect(Math.abs(r.within(6) - 98.0)).toBeLessThan(1.5)
  })
})

describe('Markdown subset', () => {
  it('parses front matter, sections, lists and inline marks', () => {
    const { data, body } = splitFrontMatter('---\nid: x\ntier: 2\n---\n\n## One\nHello **bold** and *it* `c` [l](https://a.b).\n\n- a\n- b\n\n## Two\n1. x\n2. y\n')
    expect(data).toEqual({ id: 'x', tier: 2 })
    const s = sections(body)
    expect(s.map((x) => x.title)).toEqual(['One', 'Two'])
    expect(s[0].blocks.map((b) => b.t)).toEqual(['p', 'ul'])
    expect(s[1].blocks[0].t).toBe('ol')
    const p = s[0].blocks[0]
    expect(p.t === 'p' && p.c.map((n) => n.t)).toEqual(['text', 'b', 'text', 'i', 'text', 'code', 'text', 'a', 'text'])
    expect(plain(inline('a **b** *c* `d` [e](#/x)'))).toBe('a b c d e')
    expect(blocks('line one\nline two').length).toBe(1)
    expect(parse('a: 1')).toEqual({ a: 1 })
  })
})

describe('routes', () => {
  it('round-trips the stage 3a screens', () => {
    const routes: Route[] = [
      { page: 'catalog' },
      { page: 'library' },
      { page: 'learn' },
      { page: 'learn', id: 'cycle-time' },
      { page: 'diagnose' },
      { page: 'diagnose', id: 'review-bottleneck' },
      { page: 'metric', metricId: 'arrival-rate' },
    ]
    for (const r of routes) expect(parseHash(routeHash(r))).toEqual(r)
    expect(resolveId('flaky-test-rate')).toBe('flaky-rate')
  })
})
