import { describe, expect, it } from 'vitest'
import type { JobEsrEpoch } from '../../../shared/training'
import { buildEsrChartSeries, getEsrChartDomain, getEsrEpochDomain, selectEsrHistoryWindow } from './esr-chart-data'

function epochHistory(epochs: number[]): JobEsrEpoch[] {
  return epochs.map((epoch) => ({ epoch, step: epoch, models: [{ submodelIndex: null, esr: 1 / epoch }] }))
}

describe('ESR chart data', () => {
  it('reserves 20 epoch positions for early history and grows only when needed', () => {
    for (const epochs of [[], [1], [1, 2], [1, 19], [1, 20]]) {
      expect(getEsrEpochDomain(epochHistory(epochs), 'all')).toEqual([1, 20])
    }
    expect(getEsrEpochDomain(epochHistory([1, 21]), 'all')).toEqual([1, 21])
    expect(getEsrEpochDomain(epochHistory([50, 51]), 'all')).toEqual([50, 69])
    expect(getEsrEpochDomain(epochHistory([1, 150]), 'all')).toEqual([1, 150])
  })

  it('keeps recent windows at their selected epoch span even with sparse measurements', () => {
    expect(getEsrEpochDomain(epochHistory([1, 2]), 30)).toEqual([1, 30])
    expect(getEsrEpochDomain(epochHistory([1, 2]), 100)).toEqual([1, 100])
    expect(getEsrEpochDomain(epochHistory([150]), 30)).toEqual([121, 150])
    expect(getEsrEpochDomain(epochHistory([130, 140, 150]), 100)).toEqual([51, 150])
  })

  it('keeps each embedded model separate, including rises in validation error', () => {
    const series = buildEsrChartSeries([
      { epoch: 1, step: 10, models: [
        { submodelIndex: 0, submodelName: 'channels_3', esr: 0.01 },
        { submodelIndex: 1, submodelName: 'channels_20', esr: 0.000951 }
      ] },
      { epoch: 2, step: 20, models: [
        { submodelIndex: 0, submodelName: 'channels_3', esr: 0.02 },
        { submodelIndex: 1, submodelName: 'channels_20', esr: 0.0009 }
      ] }
    ])
    expect(series.map((entry) => entry.label)).toEqual(['A2 Lite', 'A2 Mammoth'])
    expect(series[0].points).toEqual([{ epoch: 1, esr: 0.01 }, { epoch: 2, esr: 0.02 }])
    expect(series[1].points[0].esr).toBe(0.000951)
    const [min, max] = getEsrChartDomain(series)
    expect(min).toBeLessThan(Math.log10(0.0009))
    expect(max).toBeGreaterThan(Math.log10(0.02))
  })

  it('handles empty, zero, and constant-value curves without a collapsed axis', () => {
    expect(getEsrChartDomain([])).toEqual([-6, 0])
    const series = buildEsrChartSeries([{ epoch: 3, step: 30, models: [{ submodelIndex: null, esr: 0 }] }])
    expect(series[0].label).toBe('Model')
    expect(getEsrChartDomain(series)).toEqual([-6, 0])
    const constant = [{ ...series[0], points: [{ epoch: 3, esr: 0.01 }] }]
    const [min, max] = getEsrChartDomain(constant)
    expect(min).toBeLessThan(-2)
    expect(max).toBeGreaterThan(-2)
  })

  it('follows the last 30 or 100 epochs without discarding full history', () => {
    const history = Array.from({ length: 150 }, (_, index) => ({
      epoch: index + 1, step: index + 1, models: [{ submodelIndex: null, esr: 1 / (index + 1) }]
    }))
    expect(selectEsrHistoryWindow(history, 30).map((entry) => entry.epoch)).toEqual(Array.from({ length: 30 }, (_, i) => i + 121))
    expect(selectEsrHistoryWindow(history, 100)[0].epoch).toBe(51)
    expect(selectEsrHistoryWindow(history, 'all')).toBe(history)
    expect(selectEsrHistoryWindow(history.filter((entry) => entry.epoch % 10 === 0), 30).map((entry) => entry.epoch)).toEqual([130, 140, 150])
    expect(selectEsrHistoryWindow([], 30)).toEqual([])
  })
})
