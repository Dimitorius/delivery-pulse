import { HYSTERESIS_TICKS } from '../app/hysteresis'
import type { Status } from '../metrics/evaluate'

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'On target',
  warn: 'Near limit',
  bad: 'Off target',
  none: 'No target',
  low: 'Low confidence',
}
const LABEL = STATUS_LABEL
const ICON: Record<Status, string> = { ok: '●', warn: '▲', bad: '■', none: '○', low: '◌' }

/**
 * The colour is the confirmed status. When the current value already reads
 * differently (not yet confirmed by 3 hourly updates), the badge says so, so
 * it never contradicts the value next to it.
 */
export function StatusBadge({
  status,
  pending,
  compact = false,
}: {
  status: Status
  pending?: { status: Status; count: number }
  compact?: boolean
}) {
  const note = pending ? `now ${LABEL[pending.status].toLowerCase()} · confirming ${pending.count}/${HYSTERESIS_TICKS}` : undefined
  const title = note ? `${LABEL[status]} → ${note} (a status changes after ${HYSTERESIS_TICKS} hourly updates in a row)` : LABEL[status]
  return (
    <span className={`status status-${status}${pending ? ' status-pending' : ''}`} title={title}>
      <span className="status-icon" aria-hidden="true">
        {ICON[status]}
      </span>
      {pending ? (
        <span className={`status-next status-${pending.status}`} aria-hidden="true">
          → {ICON[pending.status]}
        </span>
      ) : null}
      {compact ? null : <span className="status-label">{pending ? `${LABEL[status]} → ${LABEL[pending.status]}` : LABEL[status]}</span>}
      {compact || !pending ? null : (
        <span className="status-confirm">
          confirming {pending.count}/{HYSTERESIS_TICKS}
        </span>
      )}
    </span>
  )
}

export const TEAM_COLORS: Record<string, string> = {
  checkout: '#3987e5',
  payments: '#d95926',
  catalog: '#199e70',
  onboarding: '#c98500',
  platform: '#d55181',
}
