// SYNTHETIC series for catalog metrics the simulator does not produce
// (SPEC §6). Generated per metric and team from their OWN random streams,
// seeded from the main seed and the metric id: the simulator's RNG draws are
// untouched, so the curated history (seed 83) and the live tail stay exactly
// as they are. A value depends only on (seed, metric, team, week) — the same
// for every visitor, at any clock speed.

import { CATALOG, isGeneratedSynthetic, SOURCE_LABEL, type CatalogEntry } from '../content/catalog'
import type { MetricDef } from '../metrics/registry'
import { median } from '../metrics/stats'
import type { MetricCompute } from '../metrics/types'
import { SIM_EPOCH, WEEK_MS } from '../sim/calendar'
import { Rng } from '../sim/rng'
import { DEFAULT_SEED } from '../sim/simulator'
import { SYNTH_SPECS, type SynthSpec } from './specs'

/** 32-bit FNV-1a: a stable seed per (main seed, metric, team) stream. */
export function streamSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const clamp = (v: number, s: SynthSpec) => Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, v))

/** Weekly values of one team, week 0 = the week starting at SIM_EPOCH. */
export function teamSeries(id: string, team: number, weeks: number, seed = DEFAULT_SEED): number[] {
  const s = SYNTH_SPECS[id]
  if (!s) throw new Error(`No synthetic spec for "${id}"`)
  const rng = new Rng(streamSeed(seed, 'synthetic', id, team))
  const phi = s.phi ?? 0.7
  const every = s.every ?? 1
  // Each team has its own level around the typical value.
  const level = s.log ? s.base * Math.exp(0.4 * s.sd * rng.normal()) : s.base + 0.6 * s.sd * rng.normal()
  let e = rng.normal()
  const out: number[] = []
  let held = 0
  for (let k = 0; k < weeks; k++) {
    if (k % every === 0) {
      e = phi * e + Math.sqrt(1 - phi * phi) * rng.normal()
      let v: number
      if (s.quarter) v = (s.base * ((k % 13) + 1)) / 13 + s.sd * e
      else if (s.log) v = level * Math.exp(s.sd * e)
      else v = level + s.sd * e + (s.drift ?? 0) * k
      v = clamp(v, s)
      held = s.agg === 'sum' && s.decimals === 0 ? Math.round(v) : v
    }
    out.push(held)
  }
  return out
}

const cache = new Map<string, number[]>()
const CHUNK = 160 // > 14 PIs × 10 weeks

function cachedTeamSeries(id: string, team: number, week: number): number[] {
  const key = `${id}|${team}`
  let s = cache.get(key)
  if (!s || s.length <= week) cache.set(key, (s = teamSeries(id, team, Math.max(CHUNK, week + CHUNK))))
  return s
}

export const weekIndex = (t: number) => Math.max(0, Math.floor((t - SIM_EPOCH) / WEEK_MS))

/** Value for a set of teams (indices into the org's team list) at time t. */
export function syntheticValue(id: string, teams: number[], t: number): number | null {
  if (!teams.length) return null
  const w = weekIndex(t)
  const vals = teams.map((k) => cachedTeamSeries(id, k, w)[w])
  return SYNTH_SPECS[id].agg === 'sum' ? vals.reduce((a, b) => a + b, 0) : median(vals)
}

function computeFor(entry: CatalogEntry): MetricCompute {
  return (ctx) => {
    const idx = ctx.teamIds.map((t) => ctx.store.teams.findIndex((x) => x.id === t)).filter((k) => k >= 0)
    const w = weekIndex(ctx.asOf)
    return {
      value: syntheticValue(entry.id, idx, ctx.asOf),
      n: idx.length,
      recordValue: SYNTH_SPECS[entry.id].unit,
      records: idx.map((k) => ({
        id: `SYN-${ctx.store.teams[k].key}-W${w + 1}`,
        teamId: ctx.store.teams[k].id,
        label: 'synthetic weekly value',
        from: SIM_EPOCH + w * WEEK_MS,
        value: cachedTeamSeries(entry.id, k, w)[w],
      })),
    }
  }
}

/** Registry-shaped definitions so SYNTHETIC tiles reuse the Tile component. */
export function syntheticDef(entry: CatalogEntry, order: number): MetricDef {
  const s = SYNTH_SPECS[entry.id]
  return {
    id: entry.id,
    order,
    tab: entry.tab!,
    name: entry.name,
    short: entry.name,
    domain: entry.domain,
    column: 'synthetic',
    levels: entry.levels,
    source: `${entry.source} (synthetic)`,
    unit: s.unit,
    format: s.signed ? 'signed' : 'number',
    decimals: s.decimals,
    direction: 'neutral',
    window: s.every && s.every > 1 ? `new value every ${s.every} weeks` : 'weekly value',
    question: entry.q,
    definition: '',
    formula: '',
    events: [],
    target: { note: 'SYNTHETIC — no target: the series is generated, so colouring it would suggest a judgement the data cannot support.' },
    benchmark: { kind: 'by-design', label: 'No benchmark — synthetic series', summary: '', sources: [] },
    xmr: false,
    synthetic: true,
    generated: { prodSource: SOURCE_LABEL[entry.source] ?? entry.source, what: s.what },
    compute: computeFor(entry),
  }
}

export const SYNTHETIC_DEFS: MetricDef[] = CATALOG.filter(isGeneratedSynthetic).map((e, i) => syntheticDef(e, 2000 + i))
export const SYNTHETIC_BY_ID = new Map(SYNTHETIC_DEFS.map((d) => [d.id, d]))
