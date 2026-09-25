// UI state (Zustand) plus the bridge to the simulator worker. The event
// projection lives outside React; `version` bumps when new events arrive.

import { create } from 'zustand'
import { apply, createStore, type Store } from '../domain/store'
import type { FromWorker, ToWorker } from '../sim/worker'
import { DEFAULT_SEED } from '../sim/simulator'
import { PROGRAM_SCOPE } from './pulse'

export const SPEEDS = [0, 1, 10, 100] as const
export type Speed = (typeof SPEEDS)[number]

interface AppState {
  ready: boolean
  now: number
  version: number
  speed: Speed
  scope: string
  selected: string | null
  setSpeed(speed: Speed): void
  setScope(scope: string): void
  select(metricId: string | null): void
}

export const eventStore: Store = createStore()
let worker: Worker | undefined

export const useApp = create<AppState>((set) => ({
  ready: false,
  now: 0,
  version: 0,
  speed: 1,
  scope: PROGRAM_SCOPE,
  selected: null,
  setSpeed(speed) {
    post({ type: 'speed', speed })
    set({ speed })
  },
  setScope(scope) {
    set({ scope })
  },
  select(selected) {
    set({ selected })
  },
}))

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
