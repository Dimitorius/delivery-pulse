import { fmtDateTime } from '../app/format'
import { PROGRAM_SCOPE } from '../app/pulse'
import { SPEEDS, eventStore, useApp } from '../app/state'

function iterationLabel(now: number, scope: string): string {
  const pi = eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= now && now < i.end)
  const teamId = scope === PROGRAM_SCOPE ? eventStore.teams.find((t) => t.method === 'scrum')?.id : scope
  const sprint = eventStore.iterationList.find((i) => i.kind === 'sprint' && i.teamId === teamId && i.start <= now && now < i.end)
  return [pi?.name, sprint ? `Sprint ${sprint.index + 1}` : scope !== PROGRAM_SCOPE ? 'continuous flow' : undefined]
    .filter(Boolean)
    .join(' · ')
}

export function Header({ signalCount, onSignals }: { signalCount: number; onSignals: () => void }) {
  const { now, speed, setSpeed, scope, setScope } = useApp()
  return (
    <header className="header">
      <div className="brand">
        <svg viewBox="0 0 48 24" width="32" height="16" aria-hidden="true">
          <polyline points="0,12 14,12 18,4 24,20 28,8 32,12 48,12" />
        </svg>
        <span>Delivery Pulse</span>
      </div>
      <label className="scope">
        <span className="sr-only">Level</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value={PROGRAM_SCOPE}>Program · {eventStore.program?.name ?? ''}</option>
          {eventStore.teams.map((t) => (
            <option key={t.id} value={t.id}>
              Team · {t.name} ({t.method === 'kanban' ? 'Kanban' : 'Scrum'})
            </option>
          ))}
        </select>
      </label>
      <div className="clock" title="Simulated time (UTC). 1× = one working hour per second.">
        <span className="clock-time num">{fmtDateTime(now)}</span>
        <span className="clock-iter">{iterationLabel(now, scope)}</span>
      </div>
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? 'on' : ''} onClick={() => setSpeed(s)} aria-pressed={s === speed}>
            {s === 0 ? '❚❚' : `${s}×`}
          </button>
        ))}
      </div>
      <button className="ghost" disabled title="Scenarios arrive in stage 3">
        Inject scenario
      </button>
      <button className={`signals-count ${signalCount ? 'has' : ''}`} onClick={onSignals} title="Signals fired">
        <span className="num">{signalCount}</span> signals
      </button>
    </header>
  )
}
