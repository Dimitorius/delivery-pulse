// Small pieces shared by Catalog, Learn, Diagnose and the metric pages.

import { useMemo } from 'react'
import { fmtValue, unitLabel } from '../app/format'
import { computeTile, stabilizeTile } from '../app/pulse'
import { eventStore, statusBook, useApp } from '../app/state'
import { articleFor } from '../content/articles'
import { catalogEntry, isPendingLive, STATUS_LABEL, TIER_LABEL, type CatalogAlias, type CatalogEntry } from '../content/catalog'
import { METRIC_BY_ID } from '../metrics/registry'
import { SYNTHETIC_BY_ID } from '../synthetic/series'
import { Blocks, Inlines } from './Markdown'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './Status'

export function AliasChips({ aliases }: { aliases: CatalogAlias[] }) {
  if (!aliases.length) return null
  return (
    <span className="chips aliases">
      <span className="small muted">also known as</span>
      {aliases.map((a) => (
        <span key={a.fw + a.name} className={`chip alias rel-${a.rel === '≡' ? 'same' : 'approx'}`} title={a.note ?? (a.rel === '≡' ? 'Same definition.' : '')}>
          {a.rel} {a.fw}: {a.name}
        </span>
      ))}
    </span>
  )
}

export function StatusChip({ entry }: { entry: CatalogEntry }) {
  if (isPendingLive(entry)) return <span className="chip status-pending" title="Listed as live in the catalog, but not computed yet">live · not computed yet</span>
  return <span className={`chip status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
}

export function EntryChips({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="chips">
      <span className="chip">{entry.domain}</span>
      <span className="chip subtle">{TIER_LABEL[entry.tier]}</span>
      <StatusChip entry={entry} />
      {entry.status === 'synthetic' || entry.status === 'featured' ? <span className="chip synthetic">SYNTHETIC</span> : null}
      {entry.levels.map((l) => (
        <span key={l} className="chip subtle">
          {l}
        </span>
      ))}
      <span className="chip subtle">source: {entry.source}</span>
    </div>
  )
}

/** README: the metric card shows answers, the first paragraph of "Why it exists", the formula line and "Say it in an interview". */
export function LearnSummary({ id }: { id: string }) {
  const navigate = useApp((s) => s.navigate)
  const article = articleFor(id)
  if (!article) {
    return (
      <section>
        <h3>Learn</h3>
        <p className="small muted">Article coming — the text is being written and reviewed; nothing is shown until then.</p>
      </section>
    )
  }
  const why = article.sections.find((s) => s.title === 'Why it exists')?.blocks.find((b) => b.t === 'p')
  const calc = article.sections.find((s) => s.title === "How it's calculated")
  const formula = calc?.blocks.flatMap((b) => (b.t === 'p' ? b.c : [])).find((n) => n.t === 'code')
  const interview = article.sections.find((s) => s.title === 'Say it in an interview')
  return (
    <section className="learn-summary">
      <h3>Learn</h3>
      <ul className="small answers">
        {article.answers.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {why && why.t === 'p' ? (
        <p className="small">
          <Inlines nodes={why.c} />
        </p>
      ) : null}
      {formula && formula.t === 'code' ? <pre className="formula">{formula.v}</pre> : null}
      {interview ? (
        <blockquote className="small interview">
          <Blocks blocks={interview.blocks} />
        </blockquote>
      ) : null}
      <button className="link inline" onClick={() => navigate({ page: 'learn', id: article.id })}>
        Read the full article →
      </button>
    </section>
  )
}

/** A live mini tile (value, status, sparkline) for a registry or synthetic metric; a plain link for anything else. */
export function MiniTile({ id, teamIds }: { id: string; teamIds: string[] }) {
  const { now, version, select, lens } = useApp()
  const def = METRIC_BY_ID.get(id) ?? SYNTHETIC_BY_ID.get(id)
  const tile = useMemo(() => {
    if (!def) return undefined
    const t = computeTile(def, eventStore, now, teamIds)
    return def.generated ? t : stabilizeTile(t, teamIds, now, statusBook)
  }, [def, now, version, teamIds])
  const entry = catalogEntry(id)
  if (!def || !tile) {
    return (
      <button className="mini-tile" onClick={() => select(id)}>
        <span className="tile-name">{entry?.name ?? id}</span>
        <span className="small muted">{entry ? (isPendingLive(entry) ? 'not computed yet' : STATUS_LABEL[entry.status]) : 'not in the catalog'}</span>
      </button>
    )
  }
  const name = lens !== 'default' ? (def.aka?.[lens]?.name ?? def.short) : def.short
  return (
    <button className={`mini-tile tile-${tile.status}${def.synthetic ? ' synthetic' : ''}`} onClick={() => select(id)} title={plainName(entry)}>
      <span className="tile-name">
        {name}
        {def.synthetic ? <span className="badge-synthetic">SYNTHETIC</span> : null}
      </span>
      <span className="mini-value">
        <span className="num">{fmtValue(def, tile.result.value)}</span> <span className="unit">{unitLabel(def.unit)}</span>
        <StatusBadge status={tile.status} pending={tile.pending} compact />
      </span>
      <Sparkline values={tile.trend} width={110} height={22} />
    </button>
  )
}

function plainName(entry?: CatalogEntry) {
  return entry ? `${entry.name} — ${entry.q}` : undefined
}

