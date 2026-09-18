import { describe, expect, it } from 'vitest'
import { buildEsrChartSeries, getEsrChartDomain, selectEsrHistoryWindow } from './esr-chart-data'

describe('ESR chart data', () => {
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
