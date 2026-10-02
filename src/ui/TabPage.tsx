import { useLibrary, metricOn } from '../app/library'
import type { TileData } from '../app/pulse'
import { TABS } from '../app/route'
import { SAFE_FLOW_IDS } from '../app/safeFlow'
import { useApp } from '../app/state'
import { CATALOG } from '../content/catalog'
import type { Tab } from '../metrics/registry'
import { TabCharts } from './TabCharts'
import { Tile } from './Tile'
import { VIEW_PANELS } from './ViewCharts'
import { WsjfPanel } from './WsjfPanel'
import { AssessmentRadar } from './AssessmentRadar'
import { ASSESSMENTS, isAssessment } from '../synthetic/assessments'

export function TabPage({ tab, tiles, safeFlow, teamIds }: { tab: Tab; tiles: TileData[]; safeFlow?: TileData[]; teamIds: string[] }) {
  const lens = useApp((s) => s.lens)
  const navigate = useApp((s) => s.navigate)
  const metrics = useLibrary((s) => s.metrics)
  const meta = TABS.find((t) => t.id === tab)!
  const shown = safeFlow ? tiles.filter((t) => !SAFE_FLOW_IDS.includes(t.def.id as (typeof SAFE_FLOW_IDS)[number])) : tiles
  const groups = [...new Set(shown.map((t) => t.def.domain))]
  const views = CATALOG.filter((e) => e.status === 'view' && e.tab === tab && VIEW_PANELS[e.id] && metricOn({ metrics, symptoms: {} }, e.id))
  const offInLibrary = CATALOG.filter((e) => e.tab === tab && (e.status === 'synthetic' || e.status === 'view') && !metricOn({ metrics, symptoms: {} }, e.id)).length
  return (
    <main className="page tab-page">
      <header className="tab-head">
        <h1>{meta.title}</h1>
        <p className="muted">{meta.hint}</p>
        {lens !== 'default' ? (
          <p className="small muted">Framework names are shown where one exists; other metrics keep their own name.</p>
        ) : null}
      </header>
      {safeFlow ? (
        <section className="tile-group">
          <h2 className="column-title">
            SAFe flow metrics <span className="muted">· the same calculations as on Flow and Scale, under SAFe names</span>
          </h2>
          <div className="tile-grid">
            {safeFlow.map((t) => {
              const aka = t.def.aka!.safe!
              return <Tile key={t.def.id} tile={t} teams={teamIds.length} name={aka.name} eq={aka.eq === '≈' ? { mark: '≈', note: aka.note } : undefined} />
            })}
          </div>
          <p className="small muted">≈ = approximately the same measure (hover for the difference). Each tile opens the same metric page as its default-named twin.</p>
        </section>
      ) : null}
      <TabCharts tab={tab} teamIds={teamIds} />
      {views.length ? (
        <div className="tab-charts two-col">
          {views.map((v) => {
            const Panel = VIEW_PANELS[v.id]
            return <Panel key={v.id} teamIds={teamIds} />
          })}
        </div>
      ) : null}
      {groups.map((g) => (
        <section key={g} className="tile-group">
          <h2 className="column-title">{g}</h2>
          <div className="tile-grid">
            {shown
              .filter((t) => t.def.domain === g)
              .map((t) => (
                <Tile key={t.def.id} tile={t} teams={teamIds.length} />
              ))}
          </div>
          {shown.some((t) => t.def.domain === g && t.def.id === 'wsjf') ? <WsjfPanel teamIds={teamIds} /> : null}
          {shown.some((t) => t.def.domain === g && isAssessment(t.def.id)) ? (
            <div className="tab-charts two-col">
              {(Object.keys(ASSESSMENTS) as (keyof typeof ASSESSMENTS)[])
                .filter((id) => shown.some((t) => t.def.domain === g && t.def.id === id))
                .map((id) => (
                  <AssessmentRadar key={id} id={id} teamIds={teamIds} compact />
                ))}
            </div>
          ) : null}
        </section>
      ))}
      {shown.some((t) => t.def.synthetic) ? (
        <p className="small muted">
          SYNTHETIC tiles are not computed from delivery events: their inputs are simulated survey, finance or product data, or (dashed,
          “in production: …”) a generated series. They carry no target and are never coloured.
        </p>
      ) : null}
      {offInLibrary ? (
        <p className="small muted">
          {offInLibrary} more synthetic metrics and views for this tab are switched off —{' '}
          <button className="link inline" onClick={() => navigate({ page: 'library' })}>
            switch them on in the Library
          </button>
          .
        </p>
      ) : null}
    </main>
  )
}
