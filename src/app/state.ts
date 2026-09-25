// UI state (Zustand) plus the bridge to the simulator worker. The event
// projection lives outside React; `version` bumps when new events arrive.

import { create } from 'zustand'
import { apply, createStore, type Store } from '../domain/store'
import type { FromWorker, ToWorker } from '../sim/worker'
import { DEFAULT_SEED } from '../sim/simulator'
import type { Status } from '../metrics/evaluate'
import { Stabilizer } from './hysteresis'
import { PROGRAM_SCOPE } from './pulse'
import { parseHash, routeHash, type Route } from './route'

export const SPEEDS = [0, 1, 10, 100] as const
export type Lens = 'default' | 'safe' | 'flow'
export const LENSES: { id: Lens; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'safe', label: 'SAFe' },
  { id: 'flow', label: 'Flow Framework' },
]

function loadLens(): Lens {
  try {
    const v = localStorage.getItem('dp.lens')
    return v === 'safe' || v === 'flow' ? v : 'default'
  } catch {
    return 'default'
  }
}
export type Speed = (typeof SPEEDS)[number]

interface AppState {
  ready: boolean
  now: number
  version: number
  speed: Speed
  scope: string
  route: Route
  lens: Lens
  setSpeed(speed: Speed): void
  setScope(scope: string): void
  setLens(lens: Lens): void
  navigate(route: Route): void
  /** Open a metric's page. */
  select(metricId: string | null): void
}

export const eventStore: Store = createStore()
/** Status hysteresis shared by tiles, the header counter and the metric drawer. */
export const statusStabilizer = new Stabilizer<Status>()
let worker: Worker | undefined

export const useApp = create<AppState>((set) => ({
  ready: false,
  now: 0,
  version: 0,
  speed: 1,
  scope: PROGRAM_SCOPE,
  route: typeof location === 'undefined' ? { page: 'pulse' } : parseHash(location.hash),
  lens: typeof localStorage === 'undefined' ? 'default' : loadLens(),
  setSpeed(speed) {
    post({ type: 'speed', speed })
    set({ speed })
  },
  setScope(scope) {
    set({ scope })
  },
  setLens(lens) {
    try {
      localStorage.setItem('dp.lens', lens)
    } catch {
      /* per-viewer convenience only */
    }
    set({ lens })
  },
  navigate(route) {
    const hash = routeHash(route)
    if (location.hash !== hash) location.hash = hash
    set({ route })
    window.scrollTo(0, 0)
  },
  select(metricId) {
    if (metricId) useApp.getState().navigate({ page: 'metric', metricId })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => useApp.setState({ route: parseHash(location.hash) }))
}

function post(msg: ToWorker) {
  worker?.postMessage(msg)
}

export function startSimulation(seed = DEFAULT_SEED) {
  if (worker) return
  worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    for (const ev of e.data.events) apply(eventStore, ev)
    eventStore.now = Math.max(eventStore.now, e.data.now)
    useApp.setState((s) => ({ ready: true, now: eventStore.now, version: s.version + 1 }))
  }
  post({ type: 'start', seed, speed: useApp.getState().speed })
}
