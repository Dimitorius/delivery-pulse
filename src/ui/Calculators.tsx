// Interactive calculators for articles with a `calculator` field. Defaults are
// the worked examples from the articles.

import { useMemo, useState } from 'react'
import { fmtNumber } from '../app/format'
import type { CalculatorId } from '../content/articles'
import { cyclePercentiles, monteCarloWeeks, parseNumbers, sayDo } from '../content/calculators'
import { CHART, EChart, type EChartsOption } from './EChart'
import { axis, tooltip } from './TabCharts'

export function Calculator({ id }: { id: CalculatorId }) {
  return (
    <section className="calculator panel">
      {id === 'cycle-percentiles' ? <CyclePercentiles /> : id === 'say-do' ? <SayDo /> : <MonteCarlo />}
    </section>
  )
}

function CyclePercentiles() {
  const [text, setText] = useState('1, 2, 2, 3, 3, 4, 5, 6, 9, 21')
  const r = useMemo(() => cyclePercentiles(parseNumbers(text)), [text])
  return (
    <>
      <h3>Calculator · cycle time percentiles</h3>
      <label className="small muted">
        Cycle times of finished items (days), separated by commas or spaces
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      </label>
      {r ? (
        <div className="calc-out">
          <div>
            <span className="k">P50 (median)</span> <span className="num">{fmtNumber(r.p50, 1)} d</span>{' '}
            <span className="muted small">value #{r.p50Rank} of {r.n}</span>
          </div>
          <div>
            <span className="k">P85</span> <span className="num">{fmtNumber(r.p85, 1)} d</span>{' '}
            <span className="muted small">value #{r.p85Rank} = ⌈0.85 × {r.n}⌉</span>
          </div>
          <div>
            <span className="k">Mean (for contrast)</span> <span className="num">{fmtNumber(r.mean, 1)} d</span>{' '}
            <span className="muted small">
              higher than {r.belowMean} of {r.n} items
            </span>
          </div>
          <div>
            <span className="k">P85 ÷ P50</span> <span className="num">{r.tailRatio === null ? '—' : fmtNumber(r.tailRatio, 1)}</span>
          </div>
          <p className="small">
            Honest promise: “half our items finish within {fmtNumber(r.p50, 1)} days, 85 % within {fmtNumber(r.p85, 1)}.”
          </p>
          <p className="small muted num">sorted: {r.sorted.join(', ')}</p>
        </div>
      ) : (
        <p className="small muted">Enter at least one number.</p>
      )}
    </>
  )
}

function SayDo() {
  const [planned, setPlanned] = useState(40)
  const [done, setDone] = useState(34)
  const [added, setAdded] = useState(6)
  const r = sayDo(planned, done)
  return (
    <>
      <h3>Calculator · Say/Do</h3>
      <div className="calc-inputs">
        <label className="small muted">
          Planned at sprint planning (points)
          <input type="number" min={0} value={planned} onChange={(e) => setPlanned(Number(e.target.value))} />
        </label>
        <label className="small muted">
          Of those, Done at sprint end
          <input type="number" min={0} value={done} onChange={(e) => setDone(Number(e.target.value))} />
        </label>
        <label className="small muted">
          Added mid-sprint and finished
          <input type="number" min={0} value={added} onChange={(e) => setAdded(Number(e.target.value))} />
        </label>
      </div>
      {r ? (
        <div className="calc-out">
          <div>
            <span className="k">Say/Do</span> <span className="num">{fmtNumber(r.ratio, 0)} %</span>{' '}
            <span className="muted small">
              = {Math.min(done, planned)} ÷ {planned}
            </span>
          </div>
          <p className="small">{r.reading}</p>
          {added > 0 ? <p className="small muted">The {added} added points are excluded from both sides — they explain the gap, they do not raise the ratio.</p> : null}
        </div>
      ) : (
        <p className="small muted">Planned must be above 0.</p>
      )}
    </>
  )
}

function MonteCarlo() {
  const [history, setHistory] = useState('3, 5, 4, 6, 2, 5, 4, 7')
  const [remaining, setRemaining] = useState(20)
  const [deadline, setDeadline] = useState(5)
  const r = useMemo(() => monteCarloWeeks(parseNumbers(history), remaining), [history, remaining])
  const option = useMemo((): EChartsOption | null => {
    if (!r) return null
    return {
      animation: false,
      grid: { left: 40, right: 40, top: 16, bottom: 28 },
      tooltip: { ...tooltip, valueFormatter: (v: number) => `${fmtNumber(v, 1)} %` },
      xAxis: { type: 'category', data: r.byWeek.map((b) => `${b.weeks} wk`), ...axis(), splitLine: { show: false } },
      yAxis: [
        { type: 'value', ...axis(), axisLabel: { ...axis().axisLabel, formatter: '{value} %' } },
        { type: 'value', max: 100, ...axis(), splitLine: { show: false }, axisLabel: { ...axis().axisLabel, formatter: '{value} %' } },
      ],
      series: [
        { type: 'bar', name: 'trials finishing in that week', data: r.byWeek.map((b) => b.share), barMaxWidth: 28, itemStyle: { color: CHART.line, borderRadius: [4, 4, 0, 0] } },
        { type: 'line', name: 'finished by then (cumulative)', yAxisIndex: 1, data: r.byWeek.map((b) => b.cumulative), lineStyle: { color: CHART.muted }, itemStyle: { color: CHART.muted } },
      ],
    }
  }, [r])
  return (
    <>
      <h3>Calculator · Monte Carlo “when will it be done?”</h3>
      <div className="calc-inputs">
        <label className="small muted wide">
          Weekly throughput history (items per week)
          <input value={history} onChange={(e) => setHistory(e.target.value)} />
        </label>
        <label className="small muted">
          Remaining items
          <input type="number" min={1} value={remaining} onChange={(e) => setRemaining(Number(e.target.value))} />
        </label>
        <label className="small muted">
          Deadline (weeks from now)
          <input type="number" min={1} value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} />
        </label>
      </div>
      {r && option ? (
        <div className="calc-out">
          <div>
            <span className="k">P50 / P85 / P95</span>{' '}
            <span className="num">
              {r.p50} / {r.p85} / {r.p95} weeks
            </span>
          </div>
          <div>
            <span className="k">Done within {deadline} weeks</span> <span className="num">{fmtNumber(r.within(deadline), 0)} %</span>{' '}
            <span className="muted small">of {r.trials.toLocaleString('en-US')} trials (fixed seed — the same answer every time)</span>
          </div>
          <EChart option={option} height={180} />
        </div>
      ) : (
        <p className="small muted">Enter a throughput history with at least one week above 0 and remaining items above 0.</p>
      )}
    </>
  )
}
