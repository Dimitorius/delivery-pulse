import { TABS, SERVICE_TABS, type Route } from '../app/route'
import { useApp } from '../app/state'

export function Nav() {
  const { route, navigate } = useApp()
  const active = (r: Route) =>
    r.page === route.page && (r.page !== 'tab' || (route.page === 'tab' && r.tab === route.tab))
  const screens: { route: Route; label: string }[] = [
    { route: { page: 'pulse' }, label: 'Pulse' },
    ...TABS.map((t) => ({ route: { page: 'tab', tab: t.id } as Route, label: t.title })),
  ]
  const service = SERVICE_TABS.map((s) => ({ route: { page: s.page } as Route, label: s.title }))
  const button = ({ route: r, label }: { route: Route; label: string }) => (
    <button key={label} className={active(r) ? 'on' : ''} onClick={() => navigate(r)} aria-current={active(r) ? 'page' : undefined}>
      {label}
    </button>
  )
  return (
    <nav className="tabs" aria-label="Screens">
      {screens.map(button)}
      <span className="tabs-sep" aria-hidden="true" />
      {service.map(button)}
    </nav>
  )
}
