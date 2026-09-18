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

export function getEsrChartDomain(series: EsrChartSeries[], logarithmic: boolean): [number, number] {
  let minimum = Infinity
  let maximum = -Infinity
  for (const entry of series) {
    for (const point of entry.points) {
      const value = logarithmic ? Math.log10(point.esr) : point.esr
      if (!Number.isFinite(value)) continue
      minimum = Math.min(minimum, value)
      maximum = Math.max(maximum, value)
    }
  }
  if (!Number.isFinite(minimum)) return [0, 1]
  if (!logarithmic) return [0, maximum === 0 ? 0.001 : maximum * 1.05]
  const padding = maximum === minimum ? 0.1 : (maximum - minimum) * 0.05
  return [minimum - padding, maximum + padding]
}
