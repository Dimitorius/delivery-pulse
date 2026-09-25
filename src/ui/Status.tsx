import type { Status } from '../metrics/evaluate'

const LABEL: Record<Status, string> = { ok: 'On target', warn: 'Watch', bad: 'Off target', none: 'No target' }
const ICON: Record<Status, string> = { ok: '●', warn: '▲', bad: '■', none: '○' }

export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  return (
    <span className={`status status-${status}`} title={LABEL[status]}>
      <span className="status-icon" aria-hidden="true">
        {ICON[status]}
      </span>
      {compact ? null : <span className="status-label">{LABEL[status]}</span>}
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
