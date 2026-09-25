import { inScope } from '../flow'
import type { MetricCompute } from '../types'

/**
 * SAFe PI Predictability (Flow Predictability): actual business value of all
 * objectives / planned business value of the committed objectives, for the
 * last PI scored at or before asOf.
 */
export const piPredictability: MetricCompute = (ctx) => {
  const scored = ctx.store.objectiveList.filter((o) => inScope(ctx, o.teamId) && o.scoredAt !== undefined && o.scoredAt <= ctx.asOf)
  if (!scored.length) return { value: null, n: 0, records: [], note: 'No PI scored yet (first Inspect & Adapt is at the end of PI 1).' }
  const lastPi = scored.reduce((a, o) => (o.scoredAt! > a.scoredAt! ? o : a)).piId
  const objs = scored.filter((o) => o.piId === lastPi)
  const planned = objs.filter((o) => o.committed).reduce((a, o) => a + o.plannedBv, 0)
  const actual = objs.reduce((a, o) => a + (o.actualBv ?? 0), 0)
  return {
    value: planned ? (100 * actual) / planned : null,
    secondary: [
      { label: 'actual BV', value: actual },
      { label: 'planned BV (committed)', value: planned },
    ],
    n: objs.length,
    recordValue: 'BV',
    records: objs.map((o) => ({ id: o.id, teamId: o.teamId, label: o.title, to: o.scoredAt, value: o.actualBv ?? 0, detail: `${o.committed ? 'committed' : 'uncommitted'} · planned ${o.plannedBv}` })),
    note: `${lastPi.replace('-', ' ')} (last Inspect & Adapt)`,
  }
}
