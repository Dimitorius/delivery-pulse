// Status hysteresis: a tile's colour only changes after the new status has been
// seen on HYSTERESIS_TICKS consecutive updates, so values hovering at a
// threshold (e.g. a forecast at 60 % ↔ 59 %) do not blink.

export const HYSTERESIS_TICKS = 3

export interface Stable<S> {
  shown: S
  pending?: S
  count: number
}

export function stepStatus<S>(prev: Stable<S> | undefined, raw: S, ticks = HYSTERESIS_TICKS): Stable<S> {
  if (!prev) return { shown: raw, count: 0 }
  if (raw === prev.shown) return { shown: prev.shown, count: 0 }
  const count = prev.pending === raw ? prev.count + 1 : 1
  if (count >= ticks) return { shown: raw, count: 0 }
  return { shown: prev.shown, pending: raw, count }
}

/** Keeps one hysteresis state per key; stepping twice on the same tick is a no-op. */
export class Stabilizer<S> {
  private states = new Map<string, Stable<S>>()
  private ticks = new Map<string, number>()

  constructor(private readonly n = HYSTERESIS_TICKS) {}

  apply(key: string, raw: S, tick: number): S {
    const prev = this.states.get(key)
    if (prev && this.ticks.get(key) === tick) return prev.shown
    const next = stepStatus(prev, raw, this.n)
    this.states.set(key, next)
    this.ticks.set(key, tick)
    return next.shown
  }

  get(key: string): S | undefined {
    return this.states.get(key)?.shown
  }
}
