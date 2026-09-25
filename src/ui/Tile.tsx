import type { TileData } from '../app/pulse'
import { useApp } from '../app/state'
import { fmtNumber, fmtValue, unitLabel } from '../app/format'
import { targetLabel } from '../metrics/evaluate'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './Status'

export function Tile({ tile, teams }: { tile: TileData; teams: number }) {
  const select = useApp((s) => s.select)
  const { def, result, status } = tile
  const secs = (result.secondary ?? []).filter((x) => x.unit !== 'date').slice(0, def.tileSecondary ?? 1)
  const secText = secs
    .map((x) => `${x.label} ${fmtNumber(x.value, x.unit === '%' || Number.isInteger(x.value) ? 0 : def.decimals)}${x.unit ? ` ${x.unit}` : ''}`)
    .join(' · ')
  return (
    <button className={`tile tile-${status}`} onClick={() => select(def.id)} aria-label={`${def.name}: details`}>
      <div className="tile-head">
        <span className="tile-name">{def.short}</span>
        <StatusBadge status={status} compact />
      </div>
      <div className="tile-value">
        <span className="num">{fmtValue(def, result.value)}</span>
        <span className="unit">{unitLabel(def.unit)}</span>
      </div>
      <div className="tile-sub">
        {status === 'low'
          ? `low confidence · n=${result.n} < ${def.minSample}`
          : result.value === null && result.note
            ? result.note
            : `${secText ? `${secText} · ` : ''}n=${result.n}`}
      </div>
      {result.flags?.map((f) => (
        <div key={f} className="tile-flag">
          {f}
        </div>
      ))}
      <div className="tile-foot">
        <Sparkline values={tile.trend} />
        <span className="tile-target">{targetLabel(def.target, def.unit, teams)}</span>
      </div>
    </button>
  )
}
