// Diagnose: the 42 symptoms by group (content/symptoms/index.yaml) and a
// card per symptom from content/symptoms/<id>.md — early and confirming
// signals with live mini tiles, hypotheses, playbook, anti-patterns and
// evidence. Missing file → "playbook coming".

import { useState } from 'react'
import { symptomOn, useLibrary } from '../app/library'
import { useApp } from '../app/state'
import { PLAYBOOK_BY_ID, SYMPTOM_BY_ID, SYMPTOM_GROUPS, SYMPTOMS, type Playbook, type SignalRef } from '../content/symptoms'
import { MiniTile } from './catalogBits'
import { Caveats } from './Caveat'
import { Blocks } from './Markdown'
import { SourceList } from './MetricPage'

export function DiagnosePage({ id, teamIds }: { id?: string; teamIds: string[] }) {
  return id ? <SymptomCard id={id} teamIds={teamIds} /> : <SymptomList />
}

function SymptomList() {
  const navigate = useApp((s) => s.navigate)
  const lib = useLibrary()
  const [showHidden, setShowHidden] = useState(false)
  const on = (id: string) => symptomOn({ metrics: {}, symptoms: lib.symptoms }, id)
  const hidden = SYMPTOMS.filter((s) => !on(s.id))
  return (
    <main className="page diagnose-page">
      <header className="tab-head">
        <h1>Diagnose</h1>
        <p className="muted">
          Start from what people say. Each symptom names the metrics that move first (early signals) and the ones that confirm it later,
          competing hypotheses with the check that separates them, and a playbook. {PLAYBOOK_BY_ID.size} of {SYMPTOMS.length} playbooks are
          written; the rest say “playbook coming”.
        </p>
      </header>
      {SYMPTOM_GROUPS.map((g) => {
        const rows = SYMPTOMS.filter((s) => s.group === g && (showHidden || on(s.id)))
        if (!rows.length) return null
        return (
          <section key={g} className="symptom-group">
            <h2 className="column-title">{g}</h2>
            <div className="symptom-grid">
              {rows.map((s) => (
                <button key={s.id} className={`symptom-card${on(s.id) ? '' : ' dim'}`} onClick={() => navigate({ page: 'diagnose', id: s.id })}>
                  <span className="symptom-name">{s.name}</span>
                  <span className="small">
                    {PLAYBOOK_BY_ID.has(s.id) ? <span className="ok-text">playbook</span> : <span className="muted">playbook coming</span>}
                    {s.scenario ? <span className="muted"> · scenario (stage 3b)</span> : null}
                    {on(s.id) ? null : <span className="muted"> · hidden in Library</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      {hidden.length ? (
        <p className="small muted">
          {hidden.length} symptom{hidden.length === 1 ? ' is' : 's are'} switched off in the Library.{' '}
          <button className="link inline" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide them' : 'Show them'}
          </button>
        </p>
      ) : null}
    </main>
  )
}

function SymptomCard({ id, teamIds }: { id: string; teamIds: string[] }) {
  const navigate = useApp((s) => s.navigate)
  const s = SYMPTOM_BY_ID.get(id)
  if (!s) {
    return (
      <main className="page">
        <p>Unknown symptom “{id}”.</p>
        <button className="link inline" onClick={() => navigate({ page: 'diagnose' })}>
          Back to Diagnose
        </button>
      </main>
    )
  }
  const pb = PLAYBOOK_BY_ID.get(id)
  return (
    <main className="page symptom-page">
      <nav className="crumbs small">
        <button className="link" onClick={() => history.back()}>
          ← Back
        </button>
        <span className="muted"> · </span>
        <a href="#/diagnose">Diagnose</a>
        <span className="muted"> / {s.group}</span>
      </nav>
      <header>
        <div className="chips">
          <span className="chip">{s.group}</span>
          {s.scenario ? <span className="chip subtle">scenario: {s.scenario} (Inject arrives in stage 3b)</span> : <span className="chip subtle">no simulator scenario</span>}
        </div>
        <h1>{s.name}</h1>
      </header>
      {pb ? <PlaybookBody pb={pb} teamIds={teamIds} /> : <p className="notice">Playbook coming — this symptom's card is being written and reviewed; nothing is shown until then.</p>}
    </main>
  )
}

function Signals({ title, hint, signals, teamIds }: { title: string; hint: string; signals: SignalRef[]; teamIds: string[] }) {
  if (!signals.length) return null
  return (
    <section>
      <h2>
        {title} <span className="small muted">· {hint}</span>
      </h2>
      <ul className="signal-list">
        {signals.map((x) => (
          <li key={x.id}>
            <MiniTile id={x.id} teamIds={teamIds} />
            <span className="small">{x.lookFor}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PlaybookBody({ pb, teamIds }: { pb: Playbook; teamIds: string[] }) {
  const section = (title: string) => pb.sections.find((s) => s.title === title)
  const known = ['What is going on', 'How it shows up in Delivery Pulse', 'Say it in an interview']
  const what = section('What is going on')
  return (
    <div className="symptom-body">
      <Caveats flags={pb.flags} />
      {pb.soundsLike.length ? (
        <section className="sounds-like">
          {pb.soundsLike.map((q) => (
            <blockquote key={q}>{q}</blockquote>
          ))}
        </section>
      ) : null}
      {what ? (
        <section>
          <h2>{what.title}</h2>
          <Blocks blocks={what.blocks} />
        </section>
      ) : null}
      <div className="two-col">
        <Signals title="Early signals" hint="move first (leading)" signals={pb.earlySignals} teamIds={teamIds} />
        <Signals title="Confirming signals" hint="move later (lagging)" signals={pb.confirmingSignals} teamIds={teamIds} />
      </div>
      <p className="small muted">Mini tiles show the current values for the selected level (program or team). Click one for its full page.</p>
      {pb.hypotheses.length ? (
        <section>
          <h2>Hypotheses · and the check that separates them</h2>
          <table className="records hypotheses">
            <thead>
              <tr>
                <th>Possible cause</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {pb.hypotheses.map((h) => (
                <tr key={h.cause}>
                  <td>{h.cause}</td>
                  <td className="muted">{h.check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="playbook">
        <h2>Playbook</h2>
        <div className="two-col">
          <div>
            <h3>Now</h3>
            <ul>
              {pb.playbook.now.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Next sprints</h3>
            <ul>
              {pb.playbook.nextSprints.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        {pb.playbook.watchAfter ? (
          <p>
            <strong>Watch after:</strong> {pb.playbook.watchAfter}
          </p>
        ) : null}
      </section>
      {pb.antiPatterns.length ? (
        <section>
          <h2>Anti-patterns</h2>
          <ul>
            {pb.antiPatterns.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {pb.evidence.length ? (
        <section>
          <h2>Evidence</h2>
          <ul className="evidence">
            {pb.evidence.map((e) => (
              <li key={e.claim}>
                <p>{e.claim}</p>
                {e.note ? <p className="small muted">{e.note}</p> : null}
                <SourceList sources={e.sources} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {pb.sections
        .filter((s) => s.title !== 'What is going on')
        .sort((a, b) => known.indexOf(a.title) - known.indexOf(b.title))
        .map((s) => (
          <section key={s.title} className={s.title === 'Say it in an interview' ? 'interview-section' : undefined}>
            <h2>{s.title}</h2>
            <Blocks blocks={s.blocks} />
          </section>
        ))}
    </div>
  )
}
