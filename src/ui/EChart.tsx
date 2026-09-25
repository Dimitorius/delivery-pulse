// Minimal ECharts wrapper with tree-shaken imports.
import { BarChart, GraphChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

echarts.use([LineChart, BarChart, GraphChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer])

export type EChartsOption = echarts.EChartsCoreOption

export function EChart({ option, height, onClick }: { option: EChartsOption; height: number; onClick?: (p: unknown) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>()

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: 'canvas' })
    chart.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      c.dispose()
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true })
  }, [option])

  useEffect(() => {
    const c = chart.current
    if (!c || !onClick) return
    c.on('click', onClick)
    return () => {
      c.off('click', onClick)
    }
  }, [onClick])

  return <div ref={el} style={{ width: '100%', height }} />
}

/** Shared chart styling tokens (dark operations-centre theme). */
export const CHART = {
  text: '#9aa4b0',
  muted: '#6e7681',
  grid: '#232a33',
  line: '#3987e5',
  surface: '#151b23',
  ok: '#0ca30c',
  warn: '#fab219',
  bad: '#d03b3b',
  font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}
