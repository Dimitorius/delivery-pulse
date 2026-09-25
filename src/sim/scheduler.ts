// Discrete-event scheduler: a binary min-heap ordered by (time, insertion
// order). Insertion order breaks ties, which keeps runs deterministic.

interface Job {
  t: number
  seq: number
  run: () => void
}

export class Scheduler {
  private heap: Job[] = []
  private seq = 0

  get size(): number {
    return this.heap.length
  }

  peekTime(): number {
    return this.heap.length ? this.heap[0].t : Infinity
  }

  push(t: number, run: () => void): void {
    const job = { t, seq: this.seq++, run }
    const h = this.heap
    h.push(job)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!less(h[i], h[p])) break
      ;[h[i], h[p]] = [h[p], h[i]]
      i = p
    }
  }

  pop(): Job | undefined {
    const h = this.heap
    if (!h.length) return undefined
    const top = h[0]
    const last = h.pop()!
    if (h.length) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && less(h[l], h[m])) m = l
        if (r < h.length && less(h[r], h[m])) m = r
        if (m === i) break
        ;[h[i], h[m]] = [h[m], h[i]]
        i = m
      }
    }
    return top
  }
}

function less(a: Job, b: Job): boolean {
  return a.t < b.t || (a.t === b.t && a.seq < b.seq)
}
