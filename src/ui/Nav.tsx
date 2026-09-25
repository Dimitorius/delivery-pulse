import { TABS, SERVICE_TABS, type Route } from '../app/route'
import { useApp } from '../app/state'

export function Nav() {
  const { route, navigate } = useApp()
  const active = (r: Route) =>
    (r.page === 'pulse' && route.page === 'pulse') || (r.page === 'tab' && route.page === 'tab' && r.tab === route.tab)
  return (
    <nav className="tabs" aria-label="Screens">
      {[{ page: 'pulse' } as Route, ...TABS.map((t) => ({ page: 'tab', tab: t.id }) as Route)].map((r) => {
        const label = r.page === 'pulse' ? 'Pulse' : TABS.find((t) => r.page === 'tab' && t.id === r.tab)!.title
        return (
          <button key={label} className={active(r) ? 'on' : ''} onClick={() => navigate(r)} aria-current={active(r) ? 'page' : undefined}>
            {label}
          </button>
        )
      })}
      <span className="tabs-sep" aria-hidden="true" />
      {SERVICE_TABS.map((s) => (
        <button key={s} disabled title="Arrives in stage 3">
          {s}
        </button>
      ))}
    </nav>
  )
}
