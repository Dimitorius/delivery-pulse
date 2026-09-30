import { describe, expect, it } from 'vitest'
import { LIVE_PIS, checkLivePi, forecastByPi } from './liveBaseline'

// Dmitry's reviews of stage 2: the elite baseline must hold through the live
// tail as seen at 100× — every future PI, not only PI 4 — checked every 4
// working hours, with no scenario injected.
describe(`elite baseline through ${LIVE_PIS} live PIs (PI 4–${3 + LIVE_PIS}, no scenario injected)`, () => {
  const live = checkLivePi()
  const pis = forecastByPi(live)

  it('covers every live PI at a 4-working-hour step', () => {
    expect(pis.map((p) => p.pi)).toEqual(Array.from({ length: LIVE_PIS }, (_, i) => 4 + i))
    expect(live.forecasts[1].w - live.forecasts[0].w).toBe(4)
  })

  it('PI forecast starts each PI on target and never drops below 86 % (clear of the 85 % threshold)', () => {
    expect(pis[0].start).toBeGreaterThanOrEqual(88)
    for (const p of pis) {
      expect(p.start, `PI ${p.pi} start`).toBeGreaterThanOrEqual(86)
      expect(p.min, `PI ${p.pi} minimum`).toBeGreaterThanOrEqual(86)
    }
  })

  it('committed + stretch (neutral second number) is alive: mostly 55–90 % at PI start, and it varies', () => {
    const starts = pis.map((p) => p.stretchStart)
    const inBand = starts.filter((v) => v >= 55 && v <= 90).length
    expect(inBand / starts.length).toBeGreaterThanOrEqual(0.7)
    expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThanOrEqual(15)
    for (const f of live.forecasts) if (f.value !== null && f.withStretch !== null) expect(f.withStretch).toBeLessThanOrEqual(f.value)
  })

  it('no Pulse tile goes off target', () => {
    expect(live.offTarget).toEqual([])
  })

  it('near-limit tiles stay rare (≤ 5 % of tile checks)', () => {
    expect(live.nearLimit.length / live.tileChecks).toBeLessThanOrEqual(0.05)
  })
})
