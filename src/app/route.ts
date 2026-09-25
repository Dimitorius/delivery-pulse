// Hash routing: #/pulse, #/<tab>, #/metric/<id>. Keeps the static GitHub Pages
// deployment simple (no server rewrites) and every screen linkable.

import type { Tab } from '../metrics/registry'

export type Route = { page: 'pulse' } | { page: 'tab'; tab: Tab } | { page: 'metric'; metricId: string }

export const TABS: { id: Tab; title: string; hint: string }[] = [
  { id: 'flow', title: 'Flow', hint: 'Throughput, cycle time, WIP, queues, and the Scrum team metrics.' },
  { id: 'delivery', title: 'Delivery', hint: 'The five DORA metrics, pull requests and CI on main.' },
  { id: 'quality', title: 'Quality & Reliability', hint: 'Defects, incidents, SLO and error budget, postmortems.' },
  { id: 'program', title: 'Program', hint: 'Dependencies, milestones, scope, risks, where capacity goes.' },
  { id: 'forecast', title: 'Forecast', hint: 'Monte Carlo forecasts and how accurate they have been.' },
  { id: 'scale', title: 'Scale (SAFe)', hint: 'PI objectives and PI predictability.' },
  { id: 'value', title: 'Value', hint: 'Evidence-Based Management value (SYNTHETIC inputs).' },
  { id: 'people', title: 'People', hint: 'Developer experience and engagement (SYNTHETIC survey data).' },
  { id: 'finance', title: 'Finance', hint: 'Earned value (SYNTHETIC finance data).' },
  { id: 'ai', title: 'AI Impact', hint: 'How much change is AI-assisted and how it fares in production.' },
]

export const SERVICE_TABS = ['Catalog', 'Diagnose', 'Library', 'Learn'] as const

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'metric' && parts[1]) return { page: 'metric', metricId: decodeURIComponent(parts[1]) }
  const tab = TABS.find((t) => t.id === parts[0])
  if (tab) return { page: 'tab', tab: tab.id }
  return { page: 'pulse' }
}

export function routeHash(r: Route): string {
  if (r.page === 'metric') return `#/metric/${encodeURIComponent(r.metricId)}`
  if (r.page === 'tab') return `#/${r.tab}`
  return '#/pulse'
}
