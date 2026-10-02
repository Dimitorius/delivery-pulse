// WSJF table under the WSJF Sequencing Adherence tile (Scale): the ART
// backlog ranked by WSJF right now, with the CoD components, and the last
// features started with their rank at the moment they started.

import { useMemo } from 'react'
import { wsjfCod } from '../domain/model'
import { COMPUTE } from '../metrics/defs'
import { wsjfBacklog } from '../metrics/defs/safe'
import { eventStore } from '../app/state'
import { useNow } from './TabCharts'
import { fmtDate } from '../app/format'

const TOP = 12

export function WsjfPanel({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const { rows, total, started } = useMemo(() => {
    const backlog = wsjfBacklog(eventStore, now).filter((r) => r.feature.firstActiveAt === undefined || r.feature.firstActiveAt > now)
    const scoped = backlog.filter((r) => teamIds.includes(r.feature.teamId))
    const adherence = COMPUTE.wsjf({ store: eventStore, asOf: now, teamIds, windowDays: 140 })
    const started = [...adherence.records].sort((a, b) => (b.from ?? 0) - (a.from ?? 0)).slice(0, 6)
    return { rows: scoped.slice(0, TOP), total: backlog.length, started }
  }, [teamIds, now, version])
  const cut = Math.ceil(total / 3)
  return (
    <div className="tab-charts two-col">
      <section className="panel">
        <h3>
          WSJF — ART backlog now <span className="muted small">· {total} features not started · top ⅓ = rank ≤ {cut}</span>
        </h3>
        <div className="table-wrap scroll-y">
          <table className="records wsjf-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Feature</th>
                <th>Team</th>
                <th className="num" title="User-business value">UBV</th>
                <th className="num" title="Time criticality">TC</th>
                <th className="num" title="Risk reduction / opportunity enablement">RR|OE</th>
                <th className="num" title="Cost of delay = UBV + TC + RR|OE">CoD</th>
                <th className="num" title="Relative job size (from the feature's story points)">Size</th>
                <th className="num">WSJF</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted small">
                    Every feature planned for this PI has started. The next PI's features get their WSJF estimates at PI Planning (inside the IP iteration).
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.feature.id} className={r.rank <= cut ? '' : 'muted'}>
                  <td className="num">{r.rank}</td>
                  <td className="ellipsis" title={r.feature.title}>
                    {r.feature.title}
                  </td>
                  <td>{eventStore.teamById.get(r.feature.teamId)?.key}</td>
                  <td className="num">{r.est.ubv}</td>
                  <td className="num">{r.est.tc}</td>
                  <td className="num">{r.est.rroe}</td>
                  <td className="num">{wsjfCod(r.est)}</td>
                  <td className="num">{r.est.jobSize}</td>
                  <td className="num">{r.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          WSJF = cost of delay ÷ job size, relative Fibonacci estimates re-made for the whole ART backlog at every PI Planning. Job size comes
          from the feature's story points. Ranks over the whole ART; the table shows the selected level.
        </p>
      </section>
      <section className="panel">
        <h3>Last features started · rank when they started</h3>
        <div className="table-wrap scroll-y">
          <table className="records">
            <tbody>
              {started.map((r) => (
                <tr key={r.id}>
                  <td className="muted num">{r.from ? fmtDate(r.from) : ''}</td>
                  <td className="ellipsis" title={r.label}>
                    {r.label}
                  </td>
                  <td>{r.teamId ? eventStore.teamById.get(r.teamId)?.key : ''}</td>
                  <td className="small">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">✓ = in the top third of the WSJF-ranked backlog at that moment. The tile is the share of ✓ over the current and previous PI.</p>
      </section>
    </div>
  )
}
