import { describe, expect, it } from 'vitest'
import { checkLivePi } from './liveBaseline'

// Dmitry's review of stage 2: the elite baseline must hold through the whole
// live PI 4 (as seen at 100×), not only at the end of the history.
describe('elite baseline through the live PI 4 (no scenario injected)', () => {
  const live = checkLivePi()

  it('PI forecast starts around 90 % and never drops below the 85 % target', () => {
    const values = live.forecasts.map((f) => f.value!)
    expect(values[0]).toBeGreaterThanOrEqual(88)
    expect(values[0]).toBeLessThanOrEqual(95)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(86) // clear of the threshold: no blinking around 85 %
  })

  it('no Pulse tile goes off target', () => {
    expect(live.offTarget).toEqual([])
  })

  it('near-limit tiles stay rare (≤ 5 % of tile-days)', () => {
    const checks = Math.ceil(live.forecasts.length / 2) * 16
    expect(live.nearLimit.length / checks).toBeLessThanOrEqual(0.05)
  })
})
