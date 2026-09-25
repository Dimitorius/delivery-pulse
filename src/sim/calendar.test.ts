import { describe, expect, it } from 'vitest'
import { SIM_EPOCH, addWorkingHours, timeToWork, workToTime, workToTimeEnd, workingDaysBetween } from './calendar'

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h)

describe('working-time calendar', () => {
  it('starts on Monday 30 March 2026, 09:00 UTC', () => {
    expect(new Date(SIM_EPOCH).getUTCDay()).toBe(1)
    expect(workToTime(0)).toBe(utc(2026, 3, 30, 9))
  })

  it('maps working hours across nights and weekends', () => {
    expect(workToTime(7.5)).toBe(utc(2026, 3, 30, 16) + 30 * 60_000)
    expect(workToTime(8)).toBe(utc(2026, 3, 31, 9)) // next morning
    expect(workToTime(40)).toBe(utc(2026, 4, 6, 9)) // Friday → Monday
  })

  it('inverts, and snaps off-hours to the working boundary', () => {
    for (const w of [0, 3.25, 8, 39, 41, 1040]) expect(timeToWork(workToTime(w))).toBeCloseTo(w, 9)
    expect(timeToWork(utc(2026, 3, 30, 20))).toBe(8) // Monday evening = end of Monday
    expect(timeToWork(utc(2026, 4, 4, 12))).toBe(40) // Saturday = Monday 09:00
  })

  it('adds working hours over a weekend', () => {
    // Friday 3 April 15:00 + 4 working hours = Monday 6 April 11:00
    expect(addWorkingHours(utc(2026, 4, 3, 15), 4)).toBe(utc(2026, 4, 6, 11))
  })

  it('shows a day boundary as the end of the previous day', () => {
    expect(workToTimeEnd(8)).toBe(utc(2026, 3, 30, 17))
    expect(workToTimeEnd(4)).toBe(workToTime(4))
  })

  it('counts 20 working days in 4 calendar weeks', () => {
    expect(workingDaysBetween(utc(2026, 6, 1), utc(2026, 6, 29))).toBe(20)
  })
})
