// Catalog: every metric in content/catalog.yaml, filterable by domain, tier,
// status, level and source; "also known as" chips from the aliases; a click
// opens the metric page.

import { useMemo, useState } from 'react'
import { metricOn, useLibrary } from '../app/library'
import { useApp } from '../app/state'
import { articleFor } from '../content/articles'
import { CATALOG, isPendingLive, STATUS_LABEL, TIER_LABEL, type CatalogEntry, type CatalogStatus, type Level, type Tier } from '../content/catalog'
import { AliasChips, StatusChip } from './catalogBits'

const DOMAINS = [...new Set(CATALOG.map((e) => e.domain))]
const SOURCES = [...new Set(CATALOG.map((e) => e.source))].sort()
const STATUSES: CatalogStatus[] = ['live', 'featured', 'synthetic', 'view', 'anti']
const LEVELS: Level[] = ['lagging', 'current', 'leading']
const TIERS: Tier[] = [1, 2, 3, 4]

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

function ChipFilter<T extends string | number>({ label, options, value, onChange, text }: { label: string; options: T[]; value: Set<T>; onChange(v: Set<T>): void; text(v: T): string }) {
  return (
    <div className="filter" role="group" aria-label={label}>
      <span className="filter-label small muted">{label}</span>
      {options.map((o) => (
        <button key={String(o)} className={`chip-btn${value.has(o) ? ' on' : ''}`} aria-pressed={value.has(o)} onClick={() => onChange(toggle(value, o))}>
          {text(o)}
        </button>
      ))}
    </div>
  )
}

export function CatalogPage() {
  const select = useApp((s) => s.select)
  const library = useLibrary((s) => s.metrics)
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('')
  const [source, setSource] = useState('')
  const [tiers, setTiers] = useState(new Set<Tier>())
  const [statuses, setStatuses] = useState(new Set<CatalogStatus>())
  const [levels, setLevels] = useState(new Set<Level>())

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter(
      (e) =>
        (!domain || e.domain === domain) &&
        (!source || e.source === source) &&
        (!tiers.size || tiers.has(e.tier)) &&
        (!statuses.size || statuses.has(e.status)) &&
        (!levels.size || e.levels.some((l) => levels.has(l))) &&
        (!q || [e.name, e.q, e.id, ...e.aliases.map((a) => a.name)].some((s) => s.toLowerCase().includes(q))),
    )
  }, [query, domain, source, tiers, statuses, levels])

  const filtered = query || domain || source || tiers.size || statuses.size || levels.size
  const reset = () => {
    setQuery('')
    setDomain('')
    setSource('')
    setTiers(new Set())
    setStatuses(new Set())
    setLevels(new Set())
  }
  const counts = STATUSES.map((s) => `${CATALOG.filter((e) => e.status === s).length} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ')

  return (
    <main className="page catalog-page">
      <header className="tab-head">
        <h1>Catalog</h1>
        <p className="muted">
          Every metric in the product — {CATALOG.length} in total: {counts}. Live metrics are computed from simulator events; synthetic
          ones show a generated series (switch them on in the Library); anti-metrics live here and in Learn only.
        </p>
      </header>
      <section className="filters">
        <div className="filter-row">
          <input className="search" type="search" placeholder="Search name, question or framework name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
          <label className="small muted">
            Domain{' '}
            <select value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">all</option>
              {DOMAINS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="small muted">
            Source{' '}
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">all</option>
              {SOURCES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {filtered ? (
            <button className="link inline" onClick={reset}>
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="filter-row">
          <ChipFilter label="Tier" options={TIERS} value={tiers} onChange={setTiers} text={(t) => TIER_LABEL[t]} />
        </div>
        <div className="filter-row">
          <ChipFilter label="Status" options={STATUSES} value={statuses} onChange={setStatuses} text={(s) => STATUS_LABEL[s]} />
          <ChipFilter label="Level" options={LEVELS} value={levels} onChange={setLevels} text={(l) => l} />
        </div>
      </section>
      <p className="small muted">
        {rows.length} of {CATALOG.length} metrics
      </p>
      <div className="table-wrap">
        <table className="records catalog-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Domain</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Level</th>
              <th>Source</th>
              <th>Learn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <Row key={e.id} e={e} on={metricOn({ metrics: library, symptoms: {} }, e.id)} open={() => select(e.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

function Row({ e, on, open }: { e: CatalogEntry; on: boolean; open(): void }) {
  const shownOnTab = e.status !== 'anti' && !isPendingLive(e) && e.status !== 'live'
  return (
    <tr className="catalog-row" onClick={open} tabIndex={0} onKeyDown={(k) => (k.key === 'Enter' ? open() : undefined)}>
      <td className="catalog-name">
        <span className="name">{e.name}</span>
        <span className="q small muted">{e.q}</span>
        <AliasChips aliases={e.aliases} />
      </td>
      <td>{e.domain}</td>
      <td className="num">{e.tier}</td>
      <td>
        <StatusChip entry={e} />
        {shownOnTab ? <span className={`small ${on ? 'ok-text' : 'muted'}`}>{on ? ' on tab' : ' off'}</span> : null}
      </td>
      <td className="small">{e.levels.join(', ')}</td>
      <td className="small">{e.source}</td>
      <td className="small">{articleFor(e.id) ? <span className="ok-text">article</span> : <span className="muted">coming</span>}</td>
    </tr>
  )
}
