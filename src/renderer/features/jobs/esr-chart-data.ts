import type { JobEsrEpoch } from '../../../shared/training'
import { formatPackedSubmodelMetricLabel } from './job-helpers'

export interface EsrChartPoint {
  epoch: number
  esr: number
}

export interface EsrChartSeries {
  id: string
  label: string
  color: string
  points: EsrChartPoint[]
}

export type EsrEpochWindow = 'all' | 100 | 30

export function selectEsrHistoryWindow(history: JobEsrEpoch[], window: EsrEpochWindow): JobEsrEpoch[] {
  if (window === 'all') return history
  const latestEpoch = history.at(-1)?.epoch ?? 0
  return history.filter((record) => record.epoch > latestEpoch - window)
}

const ESR_COLORS = ['var(--neon-cyan)', 'var(--neon-green)', 'var(--neon-gold)', '#ff8a00', '#ff4fdb', '#a58aff', 'var(--neon-magenta)']

export function getEsrSeriesColor(submodelIndex: number): string {
  return ESR_COLORS[submodelIndex] ?? `hsl(${(submodelIndex * 137.508) % 360} 100% 65%)`
}

export function buildEsrChartSeries(history: JobEsrEpoch[]): EsrChartSeries[] {
  const series = new Map<string, EsrChartSeries>()
  for (const record of history) {
    for (const model of record.models) {
      const id = model.submodelIndex == null ? 'model' : `packed-${model.submodelIndex}`
      let entry = series.get(id)
      if (!entry) {
        entry = {
          id,
          color: getEsrSeriesColor(model.submodelIndex ?? 0),
          label: model.submodelIndex == null ? 'Model' : formatPackedSubmodelMetricLabel({
            submodelIndex: model.submodelIndex,
            submodelName: model.submodelName
          }).replace(/\s+ESR$/, ''),
          points: []
        }
        series.set(id, entry)
      }
      entry.points.push({ epoch: record.epoch, esr: model.esr })
    }
  }
  return [...series.values()]
}

export function getEsrChartDomain(series: EsrChartSeries[]): [number, number] {
  let minimum = Infinity
  let maximum = -Infinity
  for (const entry of series) {
    for (const point of entry.points) {
      const value = Math.log10(point.esr)
      if (!Number.isFinite(value)) continue
      minimum = Math.min(minimum, value)
      maximum = Math.max(maximum, value)
    }
  }
  if (!Number.isFinite(minimum)) return [-6, 0]
  const padding = maximum === minimum ? 0.1 : (maximum - minimum) * 0.05
  return [minimum - padding, maximum + padding]
}
