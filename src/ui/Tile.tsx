import type { TileData } from '../app/pulse'
import { useApp } from '../app/state'
import { fmtNumber, fmtValue, unitLabel } from '../app/format'
import { targetLabel } from '../metrics/evaluate'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './Status'

export function Tile({ tile, teams }: { tile: TileData; teams: number }) {
  const select = useApp((s) => s.select)
  const { def, result, status } = tile
  const sec = result.secondary?.[0]
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
        {result.value === null && result.note
          ? result.note
          : sec
            ? `${sec.label} ${sec.unit === 'date' ? '' : fmtNumber(sec.value, sec.unit === '%' || Number.isInteger(sec.value) ? 0 : def.decimals)}${sec.unit && sec.unit !== 'date' ? ` ${sec.unit}` : ''} · n=${result.n}`
            : `n=${result.n}`}
      </div>
      <div className="tile-foot">
        <Sparkline values={tile.trend} />
        <span className="tile-target">{targetLabel(def.target, def.unit, teams)}</span>
      </div>
    </button>
  )
}
