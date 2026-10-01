// Library (SPEC §8): switch metrics and symptoms on or off over the registry.
// Only the user's overrides are stored — in IndexedDB in this browser — and
// they can be exported / imported as JSON. Defaults come from the catalog:
// live and featured on, synthetic off, views on where the tab already shows
// them, anti-metrics never (catalog and Learn only).

import { create } from 'zustand'
import { CATALOG, CATALOG_BY_ID, isPendingLive, LIVE_PANELS, type CatalogEntry } from '../content/catalog'
import { SYMPTOMS } from '../content/symptoms'

/** Views the tabs showed before the Library existed. */
export const DEFAULT_ON_VIEWS = new Set(['cumulative-flow', 'cycle-time-scatterplot'])

export function defaultOn(e: CatalogEntry): boolean {
  if (e.status === 'anti' || isPendingLive(e)) return false
  if (e.status === 'view') return DEFAULT_ON_VIEWS.has(e.id)
  return e.status === 'live' || e.status === 'featured'
}

/** Can the user switch it at all? Anti-metrics never become tiles (CLAUDE.md); not-yet-computed metrics have nothing to show. */
export const switchable = (e: CatalogEntry) => e.status !== 'anti' && !isPendingLive(e) && !LIVE_PANELS.has(e.id)

export interface LibraryData {
  metrics: Record<string, boolean>
  symptoms: Record<string, boolean>
}

export const EMPTY_LIBRARY: LibraryData = { metrics: {}, symptoms: {} }

export function metricOn(lib: LibraryData, id: string): boolean {
  const e = CATALOG_BY_ID.get(id)
  if (!e) return true // registry metric outside the catalog: always shown
  if (LIVE_PANELS.has(id)) return true
  if (!switchable(e)) return false
  return lib.metrics[id] ?? defaultOn(e)
}

export const symptomOn = (lib: LibraryData, id: string) => lib.symptoms[id] ?? true

/** Keep only real overrides: unknown ids, non-booleans and values equal to the default are dropped. */
export function normalize(input: unknown): LibraryData {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof LibraryData, unknown>>
  const metrics: Record<string, boolean> = {}
  const symptoms: Record<string, boolean> = {}
  for (const [id, v] of Object.entries((src.metrics as Record<string, unknown>) ?? {})) {
    const e = CATALOG_BY_ID.get(id)
    if (e && switchable(e) && typeof v === 'boolean' && v !== defaultOn(e)) metrics[id] = v
  }
  const known = new Set(SYMPTOMS.map((s) => s.id))
  for (const [id, v] of Object.entries((src.symptoms as Record<string, unknown>) ?? {})) {
    if (known.has(id) && typeof v === 'boolean' && v !== true) symptoms[id] = v
  }
  return { metrics, symptoms }
}

export const EXPORT_KIND = 'delivery-pulse/library'

export function exportJson(lib: LibraryData, at = new Date()): string {
  return JSON.stringify({ kind: EXPORT_KIND, version: 1, exportedAt: at.toISOString(), ...normalize(lib) }, null, 2)
}

export function importJson(text: string): LibraryData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Not a JSON file.')
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { kind?: unknown }).kind !== EXPORT_KIND) {
    throw new Error('Not a Delivery Pulse library export.')
  }
  return normalize(parsed)
}

// ---- IndexedDB persistence (per browser; survives reloads) ----------------

const DB = 'delivery-pulse'
const STORE = 'kv'
const KEY = 'library'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function load(): Promise<LibraryData> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(normalize(req.result))
    req.onerror = () => reject(req.error)
  })
}

async function save(lib: LibraryData): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(lib, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const hasIdb = () => typeof indexedDB !== 'undefined'

interface LibraryState extends LibraryData {
  loaded: boolean
  /** Set when the browser blocks IndexedDB: choices still work, but only for this visit. */
  storageError?: string
  setMetric(id: string, on: boolean): void
  setSymptom(id: string, on: boolean): void
  replace(lib: LibraryData): void
  reset(): void
}

export const useLibrary = create<LibraryState>((set, get) => {
  const persist = () => {
    if (!hasIdb()) return
    const { metrics, symptoms } = get()
    save({ metrics, symptoms }).catch((e) => set({ storageError: String(e?.message ?? e) }))
  }
  return {
    ...EMPTY_LIBRARY,
    loaded: !hasIdb(),
    setMetric(id, on) {
      set((s) => ({ metrics: normalize({ ...s, metrics: { ...s.metrics, [id]: on } }).metrics }))
      persist()
    },
    setSymptom(id, on) {
      set((s) => ({ symptoms: normalize({ ...s, symptoms: { ...s.symptoms, [id]: on } }).symptoms }))
      persist()
    },
    replace(lib) {
      set(normalize(lib))
      persist()
    },
    reset() {
      set(EMPTY_LIBRARY)
      persist()
    },
  }
})

if (hasIdb()) {
  load()
    .then((lib) => useLibrary.setState({ ...lib, loaded: true }))
    .catch((e) => useLibrary.setState({ loaded: true, storageError: String(e?.message ?? e) }))
}

/** Hook: is this metric switched on? */
export function useMetricOn(): (id: string) => boolean {
  const metrics = useLibrary((s) => s.metrics)
  return (id) => metricOn({ metrics, symptoms: {} }, id)
}

export const CATALOG_SWITCHABLE = CATALOG.filter(switchable)
