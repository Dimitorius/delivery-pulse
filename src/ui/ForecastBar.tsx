import { fmtDate, fmtNumber, fmtValue } from '../app/format'
import type { TileData } from '../app/pulse'
import { useApp } from '../app/state'
import { targetLabel } from '../metrics/evaluate'
import { StatusBadge } from './Status'

const DAY = 86_400_000

export function ForecastBar({ tile, now }: { tile?: TileData; now: number }) {
  const select = useApp((s) => s.select)
  if (!tile) return null
  const { result, def, status } = tile
  const sec = (label: string) => result.secondary?.find((s) => s.label === label)?.value ?? null
  if (result.value === null) {
    return (
      <section className="forecast empty">
        <h2>On track for the PI?</h2>
        <p className="muted">{result.note}</p>
      </section>
    )
  }
  const withStretch = sec('with stretch')
  const p50 = sec('P50 date')!
  const p85 = sec('P85 date')!
  const end = sec('PI end')!
  const lo = now
  const hi = Math.max(p85, end) + 3 * DAY
  const x = (t: number) => (100 * (t - lo)) / (hi - lo)
  return (
    <button className={`forecast tile-${status}`} onClick={() => select(def.id)} aria-label="PI forecast: details" data-tour="forecast">
      <div className="forecast-main">
        <h2>On track for the PI?</h2>
        <div className="forecast-prob">
          <span className="num">{fmtValue(def, result.value)}%</span>
          <span className="muted">committed objectives, likely by PI end</span>
        </div>
        <StatusBadge status={status} pending={tile.pending} />
        <span className="tile-target">target {targetLabel(def.target, def.unit)}</span>
        {withStretch !== null ? (
          <div className="forecast-stretch" title="Committed + uncommitted (stretch) objectives. SAFe: stretch objectives are planned but not committed, so this number has no target and no colour.">
            <span className="num">{fmtValue(def, withStretch)}%</span>
            <span className="muted">with stretch objectives · no target</span>
          </div>
        ) : null}
      </div>
      <div className="forecast-facts">
        <div>
          <span className="k">Remaining</span>
          <span className="v num">
            {sec('remaining')} / {sec('scope')} stories
          </span>
        </div>
        <div>
          <span className="k">Working days left</span>
          <span className="v num">{fmtNumber(sec('working days left'), 0)}</span>
        </div>
        <div>
          <span className="k">Monte Carlo P50 · P85</span>
          <span className="v num">
            {fmtDate(p50)} · {fmtDate(p85)}
          </span>
        </div>
      </div>
      <div className="forecast-strip" aria-hidden="true">
        <span className="strip-label top" style={{ left: `${(x(p50) + x(p85)) / 2}%`, transform: 'translateX(-50%)' }}>
          P50–P85
        </span>
        <div className="strip-track">
          <div className="strip-range" style={{ left: `${x(p50)}%`, width: `${Math.max(x(p85) - x(p50), 0.8)}%` }} />
          <div className="strip-end" style={{ left: `${x(end)}%` }} />
        </div>
        <span className="strip-label" style={{ left: 0 }}>
          now
        </span>
        <span className="strip-label end" style={{ left: `${x(end)}%`, transform: x(end) > 55 ? 'translateX(-100%)' : 'none' }}>
          PI end {fmtDate(end)}
        </span>
      </div>
    </button>
  )
}
