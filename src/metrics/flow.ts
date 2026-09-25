// Shared flow helpers: which items count, windows, time in status categories.

import { STATUS_CATEGORY, type WorkItem } from '../domain/model'
import { DAY_MS } from '../sim/calendar'
import type { MetricContext } from './types'

/** Team-level work items (stories, bugs, tasks). Epics/features are containers. */
export function isFlowItem(item: WorkItem): boolean {
  return item.type === 'story' || item.type === 'bug' || item.type === 'task'
}

export function windowStart(ctx: MetricContext): number {
  return ctx.asOf - ctx.windowDays * DAY_MS
}

export function inWindow(ctx: MetricContext, t: number | undefined): t is number {
  return t !== undefined && t > windowStart(ctx) && t <= ctx.asOf
}

export function inScope(ctx: MetricContext, teamId: string): boolean {
  return ctx.teamIds.includes(teamId)
}

export function scopedFlowItems(ctx: MetricContext): WorkItem[] {
  return ctx.store.itemList.filter((i) => isFlowItem(i) && inScope(ctx, i.teamId))
}

/** Items that reached Done inside the window. */
export function doneInWindow(ctx: MetricContext): WorkItem[] {
  return scopedFlowItems(ctx).filter((i) => i.firstActiveAt !== undefined && inWindow(ctx, i.doneAt))
}

/** Items past the commitment point and not Done at `asOf`. */
export function wipAt(ctx: MetricContext): WorkItem[] {
  return scopedFlowItems(ctx).filter(
    (i) => i.firstActiveAt !== undefined && i.firstActiveAt <= ctx.asOf && (i.doneAt === undefined || i.doneAt > ctx.asOf),
  )
}

export function cycleTimeDays(item: WorkItem): number {
  return (item.doneAt! - item.firstActiveAt!) / DAY_MS
}

export function ageDays(item: WorkItem, asOf: number): number {
  return (asOf - item.firstActiveAt!) / DAY_MS
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/**
 * Split an item's time between commitment and `until` into active and waiting.
 * Time in an active status while the item is flagged blocked counts as waiting.
 */
export function activeWaitMs(item: WorkItem, until = item.doneAt ?? Infinity): { active: number; wait: number } {
  let active = 0
  let wait = 0
  const tr = item.transitions
  for (let i = 0; i < tr.length; i++) {
    const cat = STATUS_CATEGORY[tr[i].to]
    if (cat !== 'active' && cat !== 'queue') continue
    const s = tr[i].at
    const e = Math.min(i + 1 < tr.length ? tr[i + 1].at : until, until)
    if (e <= s) continue
    if (cat === 'queue') {
      wait += e - s
    } else {
      let blocked = 0
      for (const b of item.blocks) blocked += overlap(s, e, b.start, b.end ?? until)
      active += e - s - blocked
      wait += blocked
    }
  }
  return { active, wait }
}
