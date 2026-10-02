// SAFe Competency and DevOps Health Radar (featured SYNTHETIC, stage 3b): one
// quarterly self-assessment series per dimension and team, dimension lists and
// scales from content/registry-drafts/dimensions-safe-assessments.yaml. Each
// (metric, dimension, team) has its own random stream seeded from the main
// seed (FNV), so the simulator's draws are untouched. The tile value is the
// median over the dimensions; the radar shows every dimension.

import dimsYaml from '../../content/registry-drafts/dimensions-safe-assessments.yaml'
import { median } from '../metrics/stats'
import { DEFAULT_SEED } from '../sim/simulator'
import { generate } from './series'
import type { SynthSpec } from './specs'

interface RawDims {
  'devops-health-radar': {
    scale: { levels: string[]; flag: string; sources: string[] }
    aspects: Record<string, string[]>
    verified: string[]
    flag: string
    sources: string[]
  }
  'safe-competency': {
    scale: { min: number; max: number; flag: string }
    competencies: string[]
    sources: string[]
  }
}

export interface Dimension {
  /** Shown on the radar axis. */
  name: string
  /** DevOps Health Radar: the Continuous Delivery Pipeline aspect. */
  group?: string
}

export interface Assessment {
  id: 'safe-competency' | 'devops-health-radar'
  dimensions: Dimension[]
  min: number
  max: number
  /** Level names for 1..5 (DevOps Health Radar: Sit … Fly). */
  levels?: string[]
  /** ⚠ items from the content file, shown as caveats. */
  flags: string[]
  /** What was checked against the source (content file `verified`). */
  verified: string[]
  sources: string[]
}

const raw = dimsYaml as unknown as RawDims
const devops = raw['devops-health-radar']
const comp = raw['safe-competency']

export const ASSESSMENTS: Record<Assessment['id'], Assessment> = {
  'safe-competency': {
    id: 'safe-competency',
    dimensions: comp.competencies.map((name) => ({ name })),
    min: comp.scale.min,
    max: comp.scale.max,
    flags: [comp.scale.flag],
    verified: [],
    sources: comp.sources,
  },
  'devops-health-radar': {
    id: 'devops-health-radar',
    dimensions: Object.entries(devops.aspects).flatMap(([group, acts]) => acts.map((name) => ({ name, group }))),
    min: 1,
    max: devops.scale.levels.length,
    levels: devops.scale.levels,
    flags: [devops.scale.flag, devops.flag],
    verified: devops.verified,
    sources: [...new Set([...devops.scale.sources, ...devops.sources])],
  },
}

export const isAssessment = (id: string): id is Assessment['id'] => id in ASSESSMENTS

/** Illustrative shape of one dimension's quarterly score (not a benchmark, never coloured). */
const DIM_SPEC: Record<Assessment['id'], SynthSpec> = {
  'safe-competency': { unit: 'score', decimals: 1, base: 3.6, sd: 0.35, min: 1, max: 5, agg: 'median', every: 13, phi: 0.6 },
  'devops-health-radar': { unit: 'score', decimals: 1, base: 3.4, sd: 0.45, min: 1, max: 5, agg: 'median', every: 13, phi: 0.6 },
}

const cache = new Map<string, number[]>()
const CHUNK = 160

/** Score of one dimension for one team (index into the org's team list) in week `w`. */
export function dimensionScore(id: Assessment['id'], dim: number, team: number, w: number, seed = DEFAULT_SEED): number {
  const key = `${seed}|${id}|${dim}|${team}`
  let s = cache.get(key)
  if (!s || s.length <= w) cache.set(key, (s = generate(DIM_SPEC[id], Math.max(CHUNK, w + CHUNK), seed, 'assessment', id, dim, team)))
  return Math.round(s[w] * 10) / 10
}

/** Program value of each dimension: median over the teams. */
export function dimensionScores(id: Assessment['id'], teams: number[], w: number): number[] {
  return ASSESSMENTS[id].dimensions.map((_, d) => median(teams.map((k) => dimensionScore(id, d, k, w))) ?? NaN)
}

/** Tile value: median over the dimensions of the (median-over-teams) dimension scores. */
export function assessmentValue(id: Assessment['id'], teams: number[], w: number): number | null {
  if (!teams.length) return null
  return median(dimensionScores(id, teams, w))
}

export function levelName(a: Assessment, v: number): string | undefined {
  return a.levels?.[Math.min(a.levels.length, Math.max(1, Math.round(v))) - 1]
}
