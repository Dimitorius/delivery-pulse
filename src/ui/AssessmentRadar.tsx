// Radar of a SAFe self-assessment (SYNTHETIC): every dimension now and four
// quarters ago, with the caveats and sources from the content file.

import { useMemo } from 'react'
import { eventStore, useApp } from '../app/state'
import { SOURCES } from '../metrics/registry'
import { ASSESSMENTS, dimensionScores, levelName, type Assessment } from '../synthetic/assessments'
import { weekIndex } from '../synthetic/series'
import { Caveat } from './Caveat'
import { CHART, EChart, type EChartsOption } from './EChart'
import { SourceList } from './MetricPage'
import { tooltip } from './TabCharts'

const TITLE: Record<Assessment['id'], string> = {
  'safe-competency': 'SAFe Competency Assessment — 7 core competencies',
  'devops-health-radar': 'SAFe DevOps Health Radar — 16 activities of the Continuous Delivery Pipeline',
}

export function AssessmentRadar({ id, teamIds, compact = false }: { id: Assessment['id']; teamIds: string[]; compact?: boolean }) {
  const { now, version } = useApp()
  const a = ASSESSMENTS[id]
  const option = useMemo(() => {
    const idx = teamIds.map((t) => eventStore.teams.findIndex((x) => x.id === t)).filter((k) => k >= 0)
    const w = weekIndex(now)
    const nowVals = dimensionScores(id, idx, w)
    const before = w >= 52 ? dimensionScores(id, idx, w - 52) : undefined
    const name = (d: (typeof a.dimensions)[number]) => (d.group ? `${d.group.split(' ').map((x) => x[0]).join('')} · ${d.name}` : d.name)
    const option: EChartsOption = {
      animation: false,
      tooltip: {
        ...tooltip,
        trigger: 'item',
        formatter: (p: { seriesName: string; value: number[] }) =>
          `${p.seriesName}<br/>` + a.dimensions.map((d, i) => `${name(d)}: ${p.value[i].toFixed(1)}${a.levels ? ` (${levelName(a, p.value[i])})` : ''}`).join('<br/>'),
      },
      legend: { bottom: 0, textStyle: { color: CHART.text, fontFamily: CHART.font, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      radar: {
        radius: compact ? '60%' : '66%',
        indicator: a.dimensions.map((d) => ({ name: name(d), min: 0, max: a.max })),
        splitNumber: a.max,
        axisName: { color: CHART.text, fontFamily: CHART.font, fontSize: 10 },
        splitLine: { lineStyle: { color: CHART.grid } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: CHART.grid } },
      },
      series: [
        {
          type: 'radar',
          symbolSize: 3,
          data: [
            ...(before ? [{ name: 'four quarters ago', value: before, lineStyle: { color: CHART.muted, type: 'dashed' }, itemStyle: { color: CHART.muted } }] : []),
            { name: 'latest assessment', value: nowVals, lineStyle: { color: CHART.line }, itemStyle: { color: CHART.line }, areaStyle: { color: 'rgba(57,135,229,0.12)' } },
          ],
        },
      ],
    }
    return option
  }, [id, teamIds, now, version, compact])
  return (
    <section className="panel">
      <h3>
        {TITLE[id]} <span className="badge-synthetic">SYNTHETIC</span>
      </h3>
      <EChart option={option} height={compact ? 300 : 380} />
      <p className="small muted">
        Quarterly self-assessment, {a.levels ? `levels ${a.levels.map((l, i) => `${l} = ${i + 1}`).join(', ')}` : `scale ${a.min}–${a.max}`}; program value per
        dimension = median of the teams. Generated series — no target, no colour. In production: an assessment survey.
        {a.dimensions.some((d) => d.group) ? ' Axis prefix = pipeline aspect (CE, CI, CD, RoD).' : ''}
      </p>
      {a.flags.map((f) => (
        <Caveat key={f} text={f} />
      ))}
      {compact ? null : (
        <>
          {a.verified.map((v) => (
            <p key={v} className="small muted">
              Checked: {v}
            </p>
          ))}
          <SourceList sources={a.sources.map((k) => SOURCES[k]).filter(Boolean)} />
        </>
      )}
    </section>
  )
}
