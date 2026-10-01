// Library: switch metrics and symptoms on or off over the registry. Choices
// live in this browser (IndexedDB) and travel as a JSON export.

import { useRef, useState } from 'react'
import { CATALOG_SWITCHABLE, defaultOn, exportJson, importJson, metricOn, symptomOn, useLibrary } from '../app/library'
import { TABS } from '../app/route'
import { useApp } from '../app/state'
import { STATUS_LABEL, type CatalogStatus } from '../content/catalog'
import { SYMPTOM_GROUPS, SYMPTOMS } from '../content/symptoms'

const STATUS_ORDER: CatalogStatus[] = ['synthetic', 'view', 'featured', 'live']

export function LibraryPage() {
  const lib = useLibrary()
  const select = useApp((s) => s.select)
  const navigate = useApp((s) => s.navigate)
  const [view, setView] = useState<'metrics' | 'symptoms'>('metrics')
  const [status, setStatus] = useState<CatalogStatus>('synthetic')
  const [message, setMessage] = useState<string>()
  const file = useRef<HTMLInputElement>(null)
  const data = { metrics: lib.metrics, symptoms: lib.symptoms }
  const changed = Object.keys(lib.metrics).length + Object.keys(lib.symptoms).length

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'delivery-pulse-library.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const upload = async (f: File) => {
    try {
      const next = importJson(await f.text())
      lib.replace(next)
      setMessage(`Imported: ${Object.keys(next.metrics).length + Object.keys(next.symptoms).length} changes from the defaults.`)
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`)
    }
  }

  const entries = CATALOG_SWITCHABLE.filter((e) => e.status === status)
  return (
    <main className="page library-page">
      <header className="tab-head">
        <h1>Library</h1>
        <p className="muted">
          Switch metrics and symptoms on or off. A switched-on synthetic metric or view appears on its tab; switching off a live metric
          hides its tile everywhere (signals included). Anti-metrics stay in the Catalog and Learn and never become tiles.
        </p>
        <p className="small muted">
          Saved in this browser only (IndexedDB){lib.storageError ? ` — storage unavailable here (${lib.storageError}), changes last for this visit` : ''}.{' '}
          {changed ? `${changed} change${changed === 1 ? '' : 's'} from the defaults.` : 'All defaults.'}
        </p>
        <div className="library-actions">
          <button onClick={download}>Export JSON</button>
          <button onClick={() => file.current?.click()}>Import JSON</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <button onClick={() => lib.reset()} disabled={!changed}>
            Reset to defaults
          </button>
          {message ? <span className="small muted">{message}</span> : null}
        </div>
      </header>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={view === 'metrics'} className={view === 'metrics' ? 'on' : ''} onClick={() => setView('metrics')}>
          Metrics
        </button>
        <button role="tab" aria-selected={view === 'symptoms'} className={view === 'symptoms' ? 'on' : ''} onClick={() => setView('symptoms')}>
          Symptoms ({SYMPTOMS.filter((s) => symptomOn(data, s.id)).length}/{SYMPTOMS.length} on)
        </button>
      </div>

      {view === 'metrics' ? (
        <>
          <div className="filter" role="group" aria-label="Status">
            {STATUS_ORDER.map((s) => {
              const all = CATALOG_SWITCHABLE.filter((e) => e.status === s)
              const on = all.filter((e) => metricOn(data, e.id)).length
              return (
                <button key={s} className={`chip-btn${status === s ? ' on' : ''}`} onClick={() => setStatus(s)} aria-pressed={status === s}>
                  {STATUS_LABEL[s]} · {on}/{all.length} on
                </button>
              )
            })}
          </div>
          {TABS.map((tab) => {
            const rows = entries.filter((e) => e.tab === tab.id)
            if (!rows.length) return null
            return (
              <section key={tab.id} className="library-group">
                <h2 className="column-title">
                  <button className="link inline" onClick={() => navigate({ page: 'tab', tab: tab.id })}>
                    {tab.title}
                  </button>
                </h2>
                <ul className="switch-list">
                  {rows.map((e) => {
                    const on = metricOn(data, e.id)
                    return (
                      <li key={e.id}>
                        <label className="switch">
                          <input type="checkbox" checked={on} onChange={(ev) => lib.setMetric(e.id, ev.target.checked)} />
                          <span>{e.name}</span>
                        </label>
                        <span className="small muted">{e.q}</span>
                        <span className="small muted">{on === defaultOn(e) ? '' : 'changed'}</span>
                        <button className="link inline" onClick={() => select(e.id)}>
                          open
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      ) : (
        SYMPTOM_GROUPS.map((g) => (
          <section key={g} className="library-group">
            <h2 className="column-title">{g}</h2>
            <ul className="switch-list">
              {SYMPTOMS.filter((s) => s.group === g).map((s) => (
                <li key={s.id}>
                  <label className="switch">
                    <input type="checkbox" checked={symptomOn(data, s.id)} onChange={(ev) => lib.setSymptom(s.id, ev.target.checked)} />
                    <span>{s.name}</span>
                  </label>
                  <button className="link inline" onClick={() => navigate({ page: 'diagnose', id: s.id })}>
                    open
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
