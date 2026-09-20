import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import log from 'electron-log/renderer'

import { summarizeTraining, type TrainingStatistics as Statistics } from '../../../shared/training-statistics'
import { useAppStore } from '../../state/store'
import { formatLocalDateTime } from '../../utils/date-time'

function formatRunDuration(durationMs: number | null): string {
  if (durationMs === null) return '—'
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export default function TrainingStatistics(): JSX.Element {
  const queue = useAppStore(state => state.queue)
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [dismissError, setDismissError] = useState<string | null>(null)
  const loadVersion = useRef(0)
  // Only a terminal transition or a history change requires fetching the ledger;
  // a progress update on every batch does not.
  const finishedKey = queue.filter(run => ['succeeded', 'failed', 'canceled'].includes(run.status))
    .map(run => `${run.jobId}:${run.status}:${run.finishedAt}`).join('|')

  useEffect(() => {
    let canceled = false
    const version = ++loadVersion.current
    void window.namBot.jobs.getTrainingStatistics().then(data => {
      if (!canceled && version === loadVersion.current) { setStatistics(data); setError(false) }
    }).catch((cause: unknown) => {
      log.error('Could not load training statistics:', cause)
      if (!canceled && version === loadVersion.current) setError(true)
    })
    return () => { canceled = true }
  }, [finishedKey, retry])

  const totals = statistics ? summarizeTraining(statistics) : null
  const recentRuns = useMemo(() => (statistics?.runs ?? [])
    .filter(run => run.status === 'succeeded' && !statistics?.dismissedRecentRunIds?.includes(run.jobId))
    .sort((left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt))
    .slice(0, 5), [statistics])

  const dismissRun = async (jobId?: string): Promise<void> => {
    setDismissingId(jobId ?? 'all')
    setDismissError(null)
    try {
      const data = await (jobId ? window.namBot.jobs.dismissRecentRun(jobId) : window.namBot.jobs.dismissAllRecentRuns())
      ++loadVersion.current
      setStatistics(data)
      setError(false)
    } catch (cause) {
      log.error('Could not dismiss recent dashboard run:', cause)
      setDismissError('Could not hide the selected runs. Please try again.')
    } finally {
      setDismissingId(null)
    }
  }

  return (
    <section className="console-panel training-statistics" aria-label="Lifetime training statistics">
      <div className="console-panel-heading"><h2>Training record</h2><span>LIFETIME</span></div>
      {error ? <div className="training-statistics-notice" role="status">Statistics unavailable. <button className="console-link" onClick={() => setRetry(value => value + 1)}>Retry</button></div>
        : !totals ? <p className="training-statistics-notice">Loading training record…</p>
        : <>
          <dl className="training-totals">
            <div title="Successful training runs; a packed run counts once."><dt>Completed runs</dt><dd>{totals.completed.toLocaleString()}</dd><small>Successful training jobs</small></div>
            <div title="Recorded time from training start to finish, including failed and canceled runs. Interrupted runs with unknown duration are excluded."><dt>Training time</dt><dd>{(totals.durationMs / 3_600_000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}<span> h</span></dd><small>Recorded run time</small></div>
            <div title="Epochs recorded in finished runs; epochs with no recorded evidence are excluded."><dt>Epochs trained</dt><dd>{totals.epochs.toLocaleString()}</dd><small>Across finished runs</small></div>
            <div title="Preset with the most successful runs. Names are retained from the training recipe."><dt>Most-used preset</dt><dd className="training-favorite">{totals.mostUsedPreset?.name ?? '—'}</dd><small>{totals.mostUsedPreset ? `${totals.mostUsedPreset.count.toLocaleString()} completed runs` : 'No preset records'}</small></div>
          </dl>
          <div className="recent-training">
            <div className="recent-training-heading"><h3>Recent completed runs</h3>
              <button type="button" className="btn btn-secondary btn-xs" disabled={dismissingId !== null || recentRuns.length === 0}
                title="Hide all completed runs from Dashboard only; keep in Jobs"
                onClick={() => { void dismissRun() }}>Clear all</button>
            </div>
            {dismissError && <p className="recent-training-empty" role="alert">{dismissError}</p>}
            {recentRuns.length === 0 ? <p className="recent-training-empty">{totals.completed ? 'No recent runs to show.' : 'No completed runs yet.'}</p> : (
              <table className="recent-training-table" aria-label="Recent completed runs">
                <thead><tr><th scope="col">Model</th><th scope="col">Preset</th><th scope="col">Finished</th><th scope="col">Duration</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{recentRuns.map(run => (
                  <tr key={run.jobId}>
                    <td className="recent-training-model"><span className="recent-training-name" title={run.modelName || 'Completed run'}>{run.modelName || 'Completed run'}</span></td>
                    <td className="recent-training-preset"><span title={run.presetName}>{run.presetName}</span></td>
                    <td className="recent-training-finished"><time dateTime={run.finishedAt} title="Training finished (local time)">{formatLocalDateTime(run.finishedAt)}</time></td>
                    <td className="recent-training-duration" title={run.durationMs === null ? 'Duration not recorded' : undefined}>{formatRunDuration(run.durationMs)}</td>
                    <td className="recent-training-actions"><button type="button" className="btn btn-secondary btn-xs recent-training-dismiss"
                      aria-label={`Hide ${run.modelName || 'completed run'} from Dashboard`}
                      title="Hide from Dashboard only; keep in Jobs"
                      disabled={dismissingId !== null} onClick={() => { void dismissRun(run.jobId) }}><span aria-hidden="true">×</span></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>}
    </section>
  )
}
