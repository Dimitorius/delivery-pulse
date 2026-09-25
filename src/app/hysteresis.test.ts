import { describe, expect, it } from 'vitest'
import { Stabilizer, stepStatus } from './hysteresis'

describe('status hysteresis', () => {
  it('changes only after 3 consecutive readings of the new status', () => {
    let s = stepStatus(undefined, 'warn')
    expect(s.shown).toBe('warn') // first reading is shown as is
    s = stepStatus(s, 'bad')
    s = stepStatus(s, 'bad')
    expect(s.shown).toBe('warn')
    s = stepStatus(s, 'bad')
    expect(s.shown).toBe('bad')
  })

  it('ignores a value blinking across the threshold (60 % ↔ 59 %)', () => {
    let s = stepStatus(undefined, 'warn')
    for (const raw of ['bad', 'warn', 'bad', 'warn', 'bad', 'bad', 'warn']) s = stepStatus(s, raw)
    expect(s.shown).toBe('warn')
  })

  it('steps once per tick per key', () => {
    const st = new Stabilizer<string>()
    st.apply('k', 'ok', 1)
    expect(st.apply('k', 'bad', 2)).toBe('ok')
    expect(st.apply('k', 'bad', 2)).toBe('ok') // same tick again (e.g. React re-render)
    expect(st.apply('k', 'bad', 3)).toBe('ok')
    expect(st.apply('k', 'bad', 4)).toBe('bad')
  })
})
