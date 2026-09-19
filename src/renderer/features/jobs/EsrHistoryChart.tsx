import { useMemo, useState, type JSX, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { JobEsrEpoch } from '../../../shared/training'
import { buildEsrChartSeries, getEsrChartDomain, getEsrEpochDomain, selectEsrHistoryWindow, type EsrEpochWindow } from './esr-chart-data'
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
  const [epochWindow, setEpochWindow] = useState<EsrEpochWindow>('all')
  const [hidden, setHidden] = useState<string[]>([])
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null)
  const [hoveredEpoch, setHoveredEpoch] = useState<number | null>(null)
  const windowHistory = useMemo(() => selectEsrHistoryWindow(history, epochWindow), [history, epochWindow])
  const series = useMemo(() => buildEsrChartSeries(windowHistory), [windowHistory])
  const visible = series.filter((entry) => !hidden.includes(entry.id))
  const hasZero = visible.some((entry) => entry.points.some((point) => point.esr === 0))
  const [yMin, yMax] = getEsrChartDomain(visible)
  const firstEpoch = windowHistory[0]?.epoch ?? 1
  const lastEpoch = history.at(-1)?.epoch ?? firstEpoch
  const [xMin, xMax] = getEsrEpochDomain(windowHistory, epochWindow)
  const pinned = windowHistory.some((record) => record.epoch === selectedEpoch)
  const requestedIndex = windowHistory.findIndex((record) => record.epoch === (pinned ? selectedEpoch : hoveredEpoch))
  const selectionIndex = requestedIndex < 0 ? windowHistory.length - 1 : requestedIndex
  const selection = windowHistory[selectionIndex]
  const x = (epoch: number): number => LEFT + (epoch - xMin) / (xMax - xMin) * (RIGHT - LEFT)
  const y = (esr: number): number => esr === 0 ? BOTTOM
    : BOTTOM - (Math.log10(esr) - yMin) / (yMax - yMin) * (BOTTOM - TOP)
  const xTicks = [...new Set(Array.from({ length: 5 }, (_, index) => Math.round(xMin + (xMax - xMin) * index / 4)))]

  function epochFromPointer(event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>): number | null {
    const transform = event.currentTarget.getScreenCTM()
    if (!transform || windowHistory.length === 0) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    const epoch = xMin + Math.max(0, Math.min(1, (point.x - LEFT) / (RIGHT - LEFT))) * (xMax - xMin)
    const closest = windowHistory.reduce((previous, record) =>
      Math.abs(record.epoch - epoch) < Math.abs(previous.epoch - epoch) ? record : previous)
    return closest.epoch
  }

  function returnToLatest(): void {
    setSelectedEpoch(null)
    setHoveredEpoch(null)
  }

  function inspectWithKeyboard(event: KeyboardEvent<SVGSVGElement>): void {
    let nextIndex: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown': nextIndex = Math.max(0, selectionIndex - 1); break
      case 'ArrowRight':
      case 'ArrowUp': nextIndex = Math.min(windowHistory.length - 1, selectionIndex + 1); break
      case 'Home': nextIndex = 0; break
      case 'End':
      case 'Escape':
        event.preventDefault()
        returnToLatest()
        return
      default: return
    }
    event.preventDefault()
    setSelectedEpoch(windowHistory[nextIndex].epoch)
  }

  return (
    <section className="esr-chart" data-no-card-toggle="true" aria-label="Validation ESR history">
      <div className="esr-chart-header">
        <div>
          <h5>ESR over time</h5>
        </div>
        {history.length > 0 && (
          <div className="esr-chart-controls">
            {active && <span className="esr-chart-live">Live</span>}
            <div className="esr-chart-scale" role="group" aria-label="Epoch window">
              {(['all', 100, 30] satisfies EsrEpochWindow[]).map((window) => (
                <button key={window} type="button" className={`btn btn-sm btn-secondary${epochWindow === window ? ' is-toggled' : ''}`}
                  aria-pressed={epochWindow === window} onClick={() => { setEpochWindow(window); returnToLatest() }}
                  title={window === 'all' ? 'Show the complete training history' : `Follow the last ${window} epochs`}>
                  {window === 'all' ? 'All' : `${window} epochs`}
                </button>
              ))}
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
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="slider" tabIndex={0}
              aria-label="Inspect training epoch"
              aria-valuemin={firstEpoch} aria-valuemax={lastEpoch} aria-valuenow={selection?.epoch ?? lastEpoch}
              aria-valuetext={`Epoch ${selection?.epoch ?? lastEpoch}${pinned ? ', pinned' : ''}`}
              onKeyDown={inspectWithKeyboard}
              onClick={(event) => setSelectedEpoch(epochFromPointer(event))}
              onPointerMove={(event) => { if (event.pointerType === 'mouse') setHoveredEpoch(epochFromPointer(event)) }}
              onPointerLeave={() => setHoveredEpoch(null)}>
              <title>Per-model validation ESR, logarithmic scale. Hover to inspect, click to pin. Arrow keys inspect epochs; Escape or End returns to latest.</title>
              {Array.from({ length: 5 }, (_, index) => {
                const position = TOP + (BOTTOM - TOP) * index / 4
                const value = yMax - (yMax - yMin) * index / 4
                return <g key={index}>
                  <line x1={LEFT} x2={RIGHT} y1={position} y2={position} className="esr-chart-grid" />
                  <text x={LEFT - 12} y={position + 4} textAnchor="end">{formatEsr(10 ** value)}</text>
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
          <div className="esr-chart-readout">
            <span>Values at epoch {selection?.epoch ?? lastEpoch}{pinned ? ' · Pinned' : selection?.epoch === lastEpoch ? ' · Latest' : ''}</span>
            {pinned ? <button type="button" className="runtime-artifact-link" onClick={returnToLatest}>Return to latest</button>
              : selection?.epoch !== lastEpoch && <span>Latest: {lastEpoch}</span>}
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
          {hasZero && <p className="esr-chart-help">Zero ESR is shown at the bottom of the logarithmic scale; the legend shows the exact value.</p>}
        </>
      )}
    </section>
  )
}
