// Web Worker: runs the simulator off the main thread. It first emits the
// pre-filled history, then advances the clock in accelerated time
// (1× = one working hour per real second) and streams new events.

import type { SimEvent } from '../domain/events'
import { HISTORY_W, workToTime } from './calendar'
import { Simulator } from './simulator'

export type ToWorker = { type: 'start'; seed: number; speed: number } | { type: 'speed'; speed: number }
export type FromWorker = { type: 'events'; events: SimEvent[]; now: number; history: boolean }

const TICK_MS = 500

const ctx = self as unknown as {
  postMessage(msg: FromWorker): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}

let sim: Simulator | undefined
let w = HISTORY_W
let speed = 1

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'start' && !sim) {
    speed = msg.speed
    sim = new Simulator(msg.seed)
    ctx.postMessage({ type: 'events', events: sim.advanceToWork(w), now: workToTime(w), history: true })
    setInterval(tick, TICK_MS)
  } else if (msg.type === 'speed') {
    speed = msg.speed
  }
}

function tick() {
  if (!sim || speed <= 0) return
  w += (speed * TICK_MS) / 1000
  ctx.postMessage({ type: 'events', events: sim.advanceToWork(w), now: workToTime(w), history: false })
}
