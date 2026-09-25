import type { TileData } from '../app/pulse'
import { TABS } from '../app/route'
import { useApp } from '../app/state'
import type { Tab } from '../metrics/registry'
import { TabCharts } from './TabCharts'
import { Tile } from './Tile'

export function TabPage({ tab, tiles, teamIds }: { tab: Tab; tiles: TileData[]; teamIds: string[] }) {
  const lens = useApp((s) => s.lens)
  const meta = TABS.find((t) => t.id === tab)!
  const groups = [...new Set(tiles.map((t) => t.def.domain))]
  return (
    <main className="page tab-page">
      <header className="tab-head">
        <h1>{meta.title}</h1>
        <p className="muted">{meta.hint}</p>
        {lens !== 'default' ? <p className="small muted">Dimmed tiles have no named equivalent in the selected framework lens.</p> : null}
      </header>
      <TabCharts tab={tab} teamIds={teamIds} />
      {groups.map((g) => (
        <section key={g} className="tile-group">
          <h2 className="column-title">{g}</h2>
          <div className="tile-grid">
            {tiles
              .filter((t) => t.def.domain === g)
              .map((t) => (
                <Tile key={t.def.id} tile={t} teams={teamIds.length} />
              ))}
          </div>
        </section>
      ))}
      {tiles.some((t) => t.def.synthetic) ? (
        <p className="small muted">
          SYNTHETIC: these tiles are computed from simulated survey and finance events. In production they come from surveys and
          finance systems.
        </p>
      ) : null}
    </main>
  )
}
