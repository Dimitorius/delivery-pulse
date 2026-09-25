import { useMemo } from 'react'
import { eventStore, useApp } from '../app/state'
import { CHART, EChart } from './EChart'
import { TEAM_COLORS } from './Status'

export function DependencyGraph({ now }: { now: number }) {
  const version = useApp((s) => s.version)
  const select = useApp((s) => s.select)
  const option = useMemo(() => {
    const pi = eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= now && now < i.end)
    const deps = eventStore.dependencyList.filter((d) => pi && d.createdAt >= pi.start && d.createdAt <= now)
    const teams = eventStore.teams
    const platform = teams.find((t) => t.kind === 'platform')
    const others = teams.filter((t) => t !== platform)
    const pos = new Map<string, [number, number]>()
    if (platform) pos.set(platform.id, [0, 0])
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]
    others.forEach((t, i) => {
      const [cx, cy] = corners[i % corners.length]
      pos.set(t.id, [cx * 100, cy * 70])
    })
    const edges = new Map<string, { from: string; to: string; open: number; late: number; done: number }>()
    for (const d of deps) {
      const key = `${d.fromTeamId}>${d.toTeamId}`
      const e = edges.get(key) ?? { from: d.fromTeamId, to: d.toTeamId, open: 0, late: 0, done: 0 }
      const open = d.resolvedAt === undefined || d.resolvedAt > now
      if (!open) e.done++
      else if (d.needBy < now) e.late++
      else e.open++
      edges.set(key, e)
    }
    return {
      animation: false,
      tooltip: { show: false },
      series: [
        {
          type: 'graph',
          layout: 'none',
          roam: false,
          symbolSize: 42,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 8,
          label: { show: true, color: '#e6edf3', fontFamily: CHART.font, fontSize: 11, formatter: (p: { data: { key: string } }) => p.data.key },
          data: teams.map((t) => ({
            name: t.id,
            key: t.key,
            x: pos.get(t.id)![0],
            y: pos.get(t.id)![1],
            itemStyle: { color: TEAM_COLORS[t.id] ?? CHART.line, borderColor: CHART.surface, borderWidth: 2 },
          })),
          links: [...edges.values()].map((e) => ({
            source: e.from,
            target: e.to,
            lineStyle: { color: e.late ? CHART.bad : e.open ? CHART.text : CHART.grid, width: e.late ? 2.5 : 1.5, curveness: 0.15 },
            label: {
              show: true,
              color: e.late ? CHART.bad : CHART.muted,
              fontFamily: CHART.font,
              fontSize: 10,
              formatter: [e.late && `${e.late} late`, e.open && `${e.open} open`, e.done && `${e.done} done`].filter(Boolean).join(' · '),
            },
          })),
        },
      ],
    }
  }, [version, now])
  return (
    <section className="panel deps">
      <h3>
        Dependencies · current PI
        <button className="link" onClick={() => select('overdue-dependencies')}>
          details
        </button>
      </h3>
      <EChart option={option} height={210} />
      <p className="legend small muted">
        Arrow: consumer → provider. <span className="bad-text">Red</span> = past need-by date, grey = open, faint = delivered.
      </p>
    </section>
  )
}
