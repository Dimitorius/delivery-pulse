// The full metric catalog (content/catalog.yaml, written in Cowork) joined
// with the live registry by id. The catalog adds tier, status and the
// framework aliases; for a live metric the registry keeps the numbers.

import catalogYaml from '../../content/catalog.yaml'
import { METRIC_BY_ID, type MetricDef, type Tab } from '../metrics/registry'

export type CatalogStatus = 'live' | 'featured' | 'synthetic' | 'view' | 'anti'
export type Level = 'lagging' | 'current' | 'leading'
export type Tier = 1 | 2 | 3 | 4

export interface CatalogAlias {
  fw: string
  name: string
  rel: '≡' | '≈'
  note?: string
}

interface RawEntry {
  id: string
  name: string
  domain: string
  levels: Level[]
  source: string
  tier: Tier
  status: CatalogStatus
  q: string
  aliases?: CatalogAlias[]
}

export interface CatalogEntry extends Omit<RawEntry, 'aliases'> {
  /** The id as written in content/catalog.yaml (differs from `id` for the renamed live metrics). */
  catalogId: string
  aliases: CatalogAlias[]
  /** The tab the metric belongs to; undefined for anti-metrics (catalog and Learn only). */
  tab?: Tab
  /** Registry definition when the metric is computed from simulator events. */
  def?: MetricDef
}

/**
 * Live metrics whose registry id differs from the catalog id. content/README.md:
 * "the registry wins" — the catalog entry, article and symptom references are
 * resolved to the registry id here, so content files can keep their own ids.
 */
export const CATALOG_TO_REGISTRY: Record<string, string> = {
  'queue-size-by-stage': 'queue-size',
  'pipeline-duration-p95': 'pipeline-duration',
  'flaky-test-rate': 'flaky-rate',
  'defect-reopen-rate': 'reopen-rate',
  'deployment-rework-rate': 'rework-rate',
  'error-budget-burn-rate': 'error-budget-burn',
  'monte-carlo-how-many': 'mc-how-many',
  'ai-assisted-change-share': 'ai-share',
  'ai-vs-non-ai-quality': 'ai-cfr-ratio',
}
const REGISTRY_TO_CATALOG = Object.fromEntries(Object.entries(CATALOG_TO_REGISTRY).map(([a, b]) => [b, a]))

/** Resolve any content id (catalog, article, symptom signal) to the app id. */
export const resolveId = (id: string) => CATALOG_TO_REGISTRY[id] ?? id
/** All ids a metric may be referred to by in content files. */
export const contentIds = (id: string) => [id, ...(REGISTRY_TO_CATALOG[id] ? [REGISTRY_TO_CATALOG[id]] : [])]

/** Catalog domain → tab (live metrics take the tab from the registry). */
export const DOMAIN_TAB: Record<string, Tab | undefined> = {
  Flow: 'flow',
  Scrum: 'flow',
  Backlog: 'flow',
  Delivery: 'delivery',
  Quality: 'quality',
  Reliability: 'quality',
  Security: 'quality',
  Program: 'program',
  Forecast: 'forecast',
  Scale: 'scale',
  Value: 'value',
  People: 'people',
  Finance: 'finance',
  'AI Impact': 'ai',
  'Anti-metrics': undefined,
}

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  live: 'Live',
  featured: 'Featured (synthetic)',
  synthetic: 'Synthetic',
  view: 'View (chart)',
  anti: 'Anti-metric',
}

export const TIER_LABEL: Record<Tier, string> = { 1: 'Tier 1 · Start here', 2: 'Tier 2 · Core', 3: 'Tier 3 · Situational', 4: 'Tier 4 · Specialist' }

/** Where the data comes from in production — shown on every SYNTHETIC tile. */
export const SOURCE_LABEL: Record<string, string> = {
  tracker: 'the work tracker (Jira etc.)',
  vcs: 'version control (GitHub / GitLab)',
  ci: 'the CI system',
  monitoring: 'monitoring / SLO tooling',
  incident: 'the incident tool',
  survey: 'an engineer survey',
  finance: 'finance systems',
  manual: 'manual records',
  'product-analytics': 'product analytics',
}

export const CATALOG: CatalogEntry[] = (catalogYaml as RawEntry[]).map((raw) => {
  const id = resolveId(raw.id)
  const def = METRIC_BY_ID.get(id)
  return {
    ...raw,
    id,
    catalogId: raw.id,
    aliases: raw.aliases ?? [],
    tab: def?.tab ?? DOMAIN_TAB[raw.domain],
    def,
  }
})

export const CATALOG_BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

/** Look up by app id or by content id. */
export const catalogEntry = (id: string) => CATALOG_BY_ID.get(resolveId(id))

/**
 * Catalog says "live" but there is no registry definition / compute function
 * yet: listed honestly as "not computed yet", never shown as a tile.
 */
export const isPendingLive = (e: CatalogEntry) => e.status === 'live' && !e.def && !LIVE_PANELS.has(e.id)

/** Catalog "live" entries that are a panel computed from events rather than a single number (always on their tab). */
export const LIVE_PANELS = new Set(['pi-objectives-status'])

/** Has a SYNTHETIC series generated in the browser (not from the simulator). */
export const isGeneratedSynthetic = (e: CatalogEntry) => (e.status === 'synthetic' || e.status === 'featured') && !e.def
