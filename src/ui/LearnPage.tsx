// Learn: one article per metric (content/articles/<id>.md) in tiers 1–4 and
// reading paths by role. A metric without an article says "article coming" —
// no invented text.

import { useState } from 'react'
import { useApp } from '../app/state'
import { ARTICLES, articleFor, CALCULATORS, ROLES, SECTION_ORDER, type Article, type Role } from '../content/articles'
import { CATALOG, catalogEntry, TIER_LABEL, type Tier } from '../content/catalog'
import { symptomsForMetric } from '../content/symptoms'
import { Calculator } from './Calculators'
import { AliasChips, EntryChips, MiniTile } from './catalogBits'
import { Blocks } from './Markdown'
import { SourceList } from './MetricPage'

const TIERS: Tier[] = [1, 2, 3, 4]

export function LearnPage({ id, teamIds }: { id?: string; teamIds: string[] }) {
  return id ? <ArticlePage id={id} teamIds={teamIds} /> : <LearnIndex />
}

function LearnIndex() {
  const navigate = useApp((s) => s.navigate)
  const [role, setRole] = useState<Role | 'all'>('all')
  const [open, setOpen] = useState(new Set<Tier>([1]))
  const path = role === 'all' ? [] : ARTICLES.filter((a) => a.roles.includes(role)).sort((a, b) => a.tier - b.tier)
  return (
    <main className="page learn-page">
      <header className="tab-head">
        <h1>Learn</h1>
        <p className="muted">
          One article per metric: why it exists, how it is calculated (with a worked example), how to read it, when not to use it, how it
          gets gamed, and how to explain it in an interview. {ARTICLES.length} of {CATALOG.length} articles are written; the rest say
          “article coming”.
        </p>
      </header>
      <div className="segmented" role="tablist" aria-label="Reading path">
        <button role="tab" aria-selected={role === 'all'} className={role === 'all' ? 'on' : ''} onClick={() => setRole('all')}>
          By tier
        </button>
        {ROLES.map((r) => (
          <button key={r.id} role="tab" aria-selected={role === r.id} className={role === r.id ? 'on' : ''} onClick={() => setRole(r.id)} title={r.long}>
            Path · {r.long}
          </button>
        ))}
      </div>
      {role !== 'all' ? (
        <section>
          <p className="small muted">
            Reading path for a {ROLES.find((r) => r.id === role)!.long}: the articles whose authors marked this role, in tier order.
            Metrics without an article yet are not on any path.
          </p>
          <ol className="path">
            {path.map((a) => (
              <li key={a.id}>
                <button className="link inline" onClick={() => navigate({ page: 'learn', id: a.id })}>
                  {catalogEntry(a.id)?.name ?? a.id}
                </button>{' '}
                <span className="small muted">
                  · {TIER_LABEL[a.tier]} · {catalogEntry(a.id)?.q}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        TIERS.map((t) => {
          const rows = CATALOG.filter((e) => e.tier === t)
          const written = rows.filter((e) => articleFor(e.id)).length
          const isOpen = open.has(t)
          return (
            <section key={t} className="tier">
              <h2 className="column-title">
                <button
                  className="tier-toggle"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((s) => {
                    const n = new Set(s)
                    if (n.has(t)) n.delete(t)
                    else n.add(t)
                    return n
                  })}
                >
                  {isOpen ? '▾' : '▸'} {TIER_LABEL[t]} <span className="muted">· {rows.length} metrics · {written} articles</span>
                </button>
              </h2>
              {isOpen ? (
                <ul className="learn-list">
                  {rows.map((e) => {
                    const a = articleFor(e.id)
                    return (
                      <li key={e.id}>
                        <button className="link inline" onClick={() => navigate({ page: 'learn', id: e.id })}>
                          {e.name}
                        </button>
                        <span className="small muted"> · {e.q}</span>
                        {a ? (
                          <span className="small ok-text"> · article{a.flags.length ? ` · ${a.flags.length} ⚠` : ''}</span>
                        ) : (
                          <span className="small muted"> · article coming</span>
                        )}
                        {e.status === 'anti' ? <span className="small warn-text"> · anti-metric</span> : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>
          )
        })
      )}
    </main>
  )
}

function ArticlePage({ id, teamIds }: { id: string; teamIds: string[] }) {
  const { navigate, select } = useApp()
  const entry = catalogEntry(id)
  const article = articleFor(id)
  if (!entry) {
    return (
      <main className="page">
        <p>Unknown metric “{id}”.</p>
        <button className="link inline" onClick={() => navigate({ page: 'learn' })}>
          Back to Learn
        </button>
      </main>
    )
  }
  return (
    <main className="page article-page">
      <nav className="crumbs small">
        <button className="link" onClick={() => history.back()}>
          ← Back
        </button>
        <span className="muted"> · </span>
        <a href="#/learn">Learn</a>
        <span className="muted"> / {entry.name}</span>
      </nav>
      <article className="article">
        <header>
          <EntryChips entry={entry} />
          <h1>{entry.name}</h1>
          <p className="question">{entry.q}</p>
          <AliasChips aliases={entry.aliases} />
          <p className="small">
            <button className="link inline" onClick={() => select(entry.id)}>
              Open the metric →
            </button>
          </p>
        </header>
        {article ? <ArticleBody article={article} teamIds={teamIds} /> : <p className="notice">Article coming — the text is being written and reviewed; nothing is shown until then.</p>}
      </article>
    </main>
  )
}

function ArticleBody({ article, teamIds }: { article: Article; teamIds: string[] }) {
  const { navigate } = useApp()
  const symptoms = symptomsForMetric(article.id)
  const ordered = [
    ...SECTION_ORDER.flatMap((t) => article.sections.filter((s) => s.title === t)),
    ...article.sections.filter((s) => !(SECTION_ORDER as readonly string[]).includes(s.title)),
  ]
  return (
    <>
      {article.flags.length ? (
        <section className="notice warn">
          <strong>Open for Dmitry's decision</strong>
          <ul className="small">
            {article.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="small muted">
        {TIER_LABEL[article.tier]} · reading paths: {article.roles.map((r) => ROLES.find((x) => x.id === r)?.long ?? r).join(', ') || '—'}
      </p>
      <section>
        <h2>Answers</h2>
        <ul>
          {article.answers.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
      {article.useWhen || article.avoidWhen ? (
        <section className="two-col use-avoid">
          {article.useWhen ? (
            <div>
              <h3>Use when</h3>
              <p>{article.useWhen}</p>
            </div>
          ) : null}
          {article.avoidWhen ? (
            <div>
              <h3>Avoid when</h3>
              <p>{article.avoidWhen}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      {ordered.map((s) => (
        <section key={s.title} className={s.title === 'Say it in an interview' ? 'interview-section' : undefined}>
          <h2>{s.title}</h2>
          <Blocks blocks={s.blocks} />
          {s.title === "How it's calculated" && article.calculator && (CALCULATORS as readonly string[]).includes(article.calculator) ? (
            <Calculator id={article.calculator} />
          ) : null}
        </section>
      ))}
      {article.readWith.length ? (
        <section>
          <h2>Read together with</h2>
          <ul className="read-with">
            {article.readWith.map((r) => (
              <li key={r.id}>
                <MiniTile id={r.id} teamIds={teamIds} />
                <span className="small">
                  {r.why}{' '}
                  {articleFor(r.id) ? (
                    <button className="link inline" onClick={() => navigate({ page: 'learn', id: r.id })}>
                      article →
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {symptoms.length ? (
        <section>
          <h2>Symptoms that start here</h2>
          <ul className="small">
            {symptoms.map((s) => (
              <li key={s.id}>
                <a href={`#/diagnose/${s.id}`}>{s.name}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Sources</h2>
        <SourceList sources={article.sources} />
      </section>
    </>
  )
}
