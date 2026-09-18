import { useMemo, useState, type JSX, type PointerEvent } from 'react'
import type { JobEsrEpoch } from '../../../shared/training'
import { buildEsrChartSeries, getEsrChartDomain } from './esr-chart-data'
import { formatEsr } from './job-helpers'

interface EsrHistoryChartProps {
  history: JobEsrEpoch[]
  active: boolean
}

const WIDTH = 900
const HEIGHT = 260
const LEFT = 100
const RIGHT = WIDTH - 24
const TOP = 16
const BOTTOM = HEIGHT - 36

export default function EsrHistoryChart({ history, active }: EsrHistoryChartProps): JSX.Element {
  const [logarithmic, setLogarithmic] = useState(false)
  const [hidden, setHidden] = useState<string[]>([])
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null)
  const series = useMemo(() => buildEsrChartSeries(history), [history])
  const visible = series.filter((entry) => !hidden.includes(entry.id))
  const hasZero = visible.some((entry) => entry.points.some((point) => point.esr === 0))
  const useLog = logarithmic && !hasZero
  const [yMin, yMax] = getEsrChartDomain(visible, useLog)
  const firstEpoch = history[0]?.epoch ?? 1
  const lastEpoch = history.at(-1)?.epoch ?? firstEpoch
  const xMin = firstEpoch === lastEpoch ? Math.max(0, firstEpoch - 1) : firstEpoch
  const xMax = firstEpoch === lastEpoch ? firstEpoch + 1 : lastEpoch
  const selectionIndex = selectedEpoch == null ? history.length - 1
    : Math.max(0, history.findIndex((record) => record.epoch === selectedEpoch))
  const selection = history[selectionIndex]
  const x = (epoch: number): number => LEFT + (epoch - xMin) / (xMax - xMin) * (RIGHT - LEFT)
  const y = (esr: number): number => BOTTOM - ((useLog ? Math.log10(esr) : esr) - yMin) / (yMax - yMin) * (BOTTOM - TOP)
  const xTicks = [...new Set(Array.from({ length: 5 }, (_, index) => Math.round(xMin + (xMax - xMin) * index / 4)))]

  function selectFromPointer(event: PointerEvent<SVGSVGElement>): void {
    const transform = event.currentTarget.getScreenCTM()
    if (!transform || history.length === 0) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    const epoch = xMin + Math.max(0, Math.min(1, (point.x - LEFT) / (RIGHT - LEFT))) * (xMax - xMin)
    const closest = history.reduce((previous, record) =>
      Math.abs(record.epoch - epoch) < Math.abs(previous.epoch - epoch) ? record : previous)
    setSelectedEpoch(closest.epoch)
  }

  return (
    <section className="esr-chart" data-no-card-toggle="true" aria-label="Validation ESR history">
      <div className="esr-chart-header">
        <div>
          <h5>ESR over time</h5>
          <p>Validation error per epoch · lower is better</p>
        </div>
        {history.length > 0 && (
          <div className="esr-chart-controls">
            <span className={active ? 'esr-chart-live' : 'runtime-detail-label'}>{active ? 'Live' : 'Recorded history'}</span>
            <div className="esr-chart-scale" role="group" aria-label="ESR axis scale">
              <button type="button" className={`btn btn-sm btn-secondary${!useLog ? ' is-toggled' : ''}`}
                aria-pressed={!useLog} onClick={() => setLogarithmic(false)}>Linear</button>
              <button type="button" className={`btn btn-sm btn-secondary${useLog ? ' is-toggled' : ''}`}
                aria-pressed={useLog} disabled={hasZero} onClick={() => setLogarithmic(true)}
                title={hasZero ? 'Zero ESR requires a linear scale' : 'Spread out small values to see late-stage improvements'}>Log</button>
            </div>
          </div>
        )}
      </div>
      {history.length === 0 ? (
        <p className="esr-chart-empty">{active
          ? 'Waiting for the first validation result. Each embedded model will appear here as training progresses.'
          : 'No epoch history was recorded for this run. New training runs collect it automatically.'}</p>
      ) : (
        <>
          <div className="esr-chart-plot">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
              aria-label={`Validation ESR from epoch ${firstEpoch} to ${lastEpoch}, ${useLog ? 'logarithmic' : 'linear'} scale`}
              onPointerMove={selectFromPointer} onPointerLeave={() => setSelectedEpoch(null)}>
              <title>Per-model validation ESR. Use the epoch slider below for exact values.</title>
              {Array.from({ length: 5 }, (_, index) => {
                const position = TOP + (BOTTOM - TOP) * index / 4
                const value = yMax - (yMax - yMin) * index / 4
                return <g key={index}>
                  <line x1={LEFT} x2={RIGHT} y1={position} y2={position} className="esr-chart-grid" />
                  <text x={LEFT - 12} y={position + 4} textAnchor="end">{formatEsr(useLog ? 10 ** value : value)}</text>
                </g>
              })}
              {xTicks.map((epoch) => <text key={epoch} x={x(epoch)} y={BOTTOM + 22} textAnchor="middle">{epoch}</text>)}
              {visible.map((entry) => {
                return <g key={entry.id} fill="none" stroke={entry.color}>
                  <polyline points={entry.points.map((point) => `${x(point.epoch)},${y(point.esr)}`).join(' ')}
                    strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  {entry.points.length === 1 && <circle cx={x(entry.points[0].epoch)} cy={y(entry.points[0].esr)} r="3" />}
                </g>
              })}
              {selection && <line x1={x(selection.epoch)} x2={x(selection.epoch)} y1={TOP} y2={BOTTOM} className="esr-chart-cursor" />}
            </svg>
          </div>
          <div className="esr-chart-scrubber">
            <label>
              <span>Epoch {selection?.epoch ?? lastEpoch}</span>
              <input type="range" min={0} max={history.length - 1} value={selectionIndex}
                aria-label="Inspect training epoch" aria-valuetext={`Epoch ${selection?.epoch ?? lastEpoch}`}
                onChange={(event) => setSelectedEpoch(history[Number(event.target.value)].epoch)} />
            </label>
            <button type="button" className="runtime-artifact-link" onClick={() => setSelectedEpoch(null)}>Latest epoch</button>
          </div>
          <div className="esr-chart-legend" aria-label="Models and selected epoch ESR">
            {series.map((entry) => {
              const enabled = !hidden.includes(entry.id)
              const point = entry.points.find((candidate) => candidate.epoch === selection?.epoch)
              return <button key={entry.id} type="button" className={`esr-chart-model${enabled ? '' : ' is-hidden'}`}
                aria-pressed={enabled} title={`${enabled ? 'Hide' : 'Show'} ${entry.label}`}
                onClick={() => setHidden((current) => enabled ? [...current, entry.id] : current.filter((id) => id !== entry.id))}>
                <span className="esr-chart-swatch" style={{ backgroundColor: entry.color }} />
                <span>{entry.label}</span><strong>{point ? formatEsr(point.esr) : '—'}</strong>
              </button>
            })}
          </div>
          <p className="esr-chart-help">{visible.length === 0 ? 'Select a model above to show its curve.'
            : 'Hover or drag the epoch slider to inspect values. Click a model to hide or show its curve.'}</p>
        </>
      )}
    </section>
  )
}
