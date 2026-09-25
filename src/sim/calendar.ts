// Working-time calendar. The simulated organisation works Mon–Fri 09:00–17:00
// UTC (no holidays). Simulator processes run on "working hours" (W): W = 0 is
// Monday 30 March 2026, 09:00; each W unit is one working hour.
// Metrics are reported in calendar time, like a real tracker would show them.

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS
export const WEEK_MS = 7 * DAY_MS
export const HOURS_PER_DAY = 8
export const DAY_START_HOUR = 9

/** Midnight UTC of the first simulated day (a Monday). */
export const SIM_EPOCH = Date.UTC(2026, 2, 30)

export const SPRINT_DAYS = 10
export const SPRINT_W = SPRINT_DAYS * HOURS_PER_DAY
/** SAFe PI: 4 development iterations + 1 Innovation & Planning (IP) iteration = 10 weeks. */
export const DEV_ITERATIONS_PER_PI = 4
export const ITERATIONS_PER_PI = DEV_ITERATIONS_PER_PI + 1
export const PI_W = SPRINT_W * ITERATIONS_PER_PI

/** Pre-filled history: 3 full PIs (~7 months); the live tail starts with PI 4 planning. */
export const HISTORY_W = PI_W * 3

export function isIpIteration(k: number): boolean {
  return k % ITERATIONS_PER_PI === ITERATIONS_PER_PI - 1
}

export function workToTime(w: number): number {
  const day = Math.floor(w / HOURS_PER_DAY)
  const hour = w - day * HOURS_PER_DAY
  const week = Math.floor(day / 5)
  const dow = day - week * 5
  return SIM_EPOCH + (week * 7 + dow) * DAY_MS + (DAY_START_HOUR + hour) * HOUR_MS
}

/**
 * Like workToTime, but an instant exactly on a day boundary is shown as the
 * end of the previous working day (17:00) rather than the next 09:00.
 */
export function workToTimeEnd(w: number): number {
  if (w > 0 && w % HOURS_PER_DAY === 0) return workToTime(w - HOURS_PER_DAY) + HOURS_PER_DAY * HOUR_MS
  return workToTime(w)
}

/** Inverse of workToTime. Off-hours instants map to the nearest working boundary. */
export function timeToWork(t: number): number {
  const days = Math.floor((t - SIM_EPOCH) / DAY_MS)
  const week = Math.floor(days / 7)
  const dow = days - week * 7
  if (dow >= 5) return (week * 5 + 5) * HOURS_PER_DAY
  const hourOfDay = (t - SIM_EPOCH - days * DAY_MS) / HOUR_MS
  const h = Math.min(Math.max(hourOfDay - DAY_START_HOUR, 0), HOURS_PER_DAY)
  return (week * 5 + dow) * HOURS_PER_DAY + h
}

export function addWorkingHours(t: number, hours: number): number {
  return workToTime(timeToWork(t) + hours)
}

/** Working days between two instants (fractional). */
export function workingDaysBetween(from: number, to: number): number {
  return (timeToWork(to) - timeToWork(from)) / HOURS_PER_DAY
}
