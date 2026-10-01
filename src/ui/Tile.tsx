import type { TileData } from '../app/pulse'
import { conflictNote, dimmed, displayName } from '../app/lens'
import { useApp } from '../app/state'
import { fmtNumber, fmtValue, unitLabel } from '../app/format'
import { targetLabel } from '../metrics/evaluate'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './Status'

/** `name` overrides the displayed name (e.g. the SAFe flow metrics on Scale); `eq` marks an approximate (≈) equivalent. */
export function Tile({ tile, teams, name, eq }: { tile: TileData; teams: number; name?: string; eq?: { mark: string; note: string } }) {
  const select = useApp((s) => s.select)
  const lens = useApp((s) => s.lens)
  const { def, result, status } = tile
  const dim = dimmed(def, lens)
  const secs = (result.secondary ?? []).filter((x) => x.unit !== 'date').slice(0, def.tileSecondary ?? 1)
  const secText = secs
    .map((x) => `${x.label} ${fmtNumber(x.value, secDecimals(x.value, x.unit, def.decimals))}${x.unit ? ` ${x.unit}` : ''}`)
    .join(' · ')
  return (
    <button
      className={`tile tile-${status}${dim ? ' dim' : ''}${def.synthetic ? ' synthetic' : ''}`}
      onClick={() => select(def.id)}
      aria-label={`${def.name}: details`}
      title={dim ? conflictNote(def, lens) : def.generated ? `SYNTHETIC — in production this comes from ${def.generated.prodSource}` : undefined}
    >
      <div className="tile-head">
        <span className="tile-name">
          {name ?? displayName(def, lens, true)}
          {eq ? (
            <span className="eq-mark" title={eq.note}>
              {' '}
              {eq.mark}
            </span>
          ) : null}
          {def.synthetic ? <span className="badge-synthetic">SYNTHETIC</span> : null}
        </span>
        <StatusBadge status={status} pending={tile.pending} compact />
      </div>
      <div className="tile-value">
        <span className="num">{fmtValue(def, result.value)}</span>
        <span className="unit">{unitLabel(def.unit)}</span>
      </div>
      <div className="tile-sub">
        {def.generated
          ? `in production: ${def.generated.prodSource}`
          : status === 'low'
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

function secDecimals(v: number | null, unit: string | undefined, fallback: number): number {
  if (v === null || Number.isInteger(v)) return 0
  if (Math.abs(v) < 1) return 2
  return unit === '%' ? 0 : fallback
}
