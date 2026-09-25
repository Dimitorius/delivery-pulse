import { fmtDateTime } from '../app/format'
import type { Signal } from '../app/pulse'
import { eventStore, useApp } from '../app/state'
import { StatusBadge } from './Status'

export function SignalsPanel({ signals }: { signals: Signal[] }) {
  const select = useApp((s) => s.select)
  return (
    <section className="panel signals" id="signals">
      <h3>
        Signals <span className="count num">{signals.length}</span>
      </h3>
      {signals.length === 0 ? (
        <p className="muted small">No signals. Leading indicators are inside their limits.</p>
      ) : (
        <ul>
          {signals.slice(0, 40).map((s) => (
            <li key={s.id}>
              <button onClick={() => select(s.metricId)}>
                <StatusBadge status={s.severity} compact />
                <span className="sig-title">{s.title}</span>
                <span className="sig-detail">{s.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function EventFeed({ teamIds }: { teamIds: string[] }) {
  useApp((s) => s.version)
  const entries = eventStore.feed.filter((f) => !f.teamId || teamIds.includes(f.teamId)).slice(-30).reverse()
  return (
    <section className="panel feed">
      <h3>Live events</h3>
      <ul>
        {entries.map((f, i) => (
          <li key={`${f.t}-${i}`} className={`tone-${f.tone}`}>
            <span className="feed-time num">{fmtDateTime(f.t).slice(4)}</span>
            {f.teamId ? <span className="feed-team">{eventStore.teamById.get(f.teamId)?.key}</span> : null}
            <span className="feed-text">{f.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
