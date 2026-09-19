import { memo, type JSX } from 'react'
import { useAppStore } from '../state/store'
import { getProgressPercent, isActiveRuntime } from '../features/jobs/job-helpers'
import { getTitleBarActivity } from './title-bar-state'

interface AppStatusBarProps {
  onNavigate: (path: string) => void
}

function AppStatusBar({ onNavigate }: AppStatusBarProps): JSX.Element {
  const validation = useAppStore(state => state.validation)
  const checking = useAppStore(state => state.isBackendValidationLoading)
  const accelerator = useAppStore(state => state.acceleratorDiagnostics)
  const queue = useAppStore(state => state.queue)
  const control = useAppStore(state => state.queueControl)
  const active = queue.find(job => isActiveRuntime(job.status))
  const queued = queue.filter(job => job.status === 'queued').length
  const percent = active ? getProgressPercent(active) : null
  const activity = getTitleBarActivity(queue, control)
  const backendLabel = checking ? 'Checking backend' : validation ? validation.overallOk ? 'Backend ready' : 'Backend needs attention' : 'Backend not checked'
  const acceleratorLabel = accelerator?.status === 'ready' ? 'GPU ready'
    : accelerator?.status === 'cpu_only' ? 'CPU mode'
    : !accelerator || accelerator.status === 'not_checked' ? 'Accelerator not checked' : 'Check accelerator'

  return (
    <footer className="app-status-bar" aria-label="Application status">
      <button className="status-backend" onClick={() => onNavigate('/diagnostics')} title={backendLabel}>
        <span className="status-led" data-tone={checking || !validation ? 'muted' : validation.overallOk ? 'ready' : 'warning'} aria-hidden="true" />
        {backendLabel}
      </button>
      <button className="status-accelerator" onClick={() => onNavigate('/diagnostics')}>{acceleratorLabel}</button>
      <button className="status-current-job" onClick={() => onNavigate('/jobs')} title={active ? `${activity}: ${active.jobName}` : activity}>
        <span className="status-activity" role="status" aria-live="polite" aria-atomic="true">{activity}</span>
        {active && <span className="status-job-name">{active.jobName}</span>}
        {percent !== null && <span>{Math.round(percent)}%</span>}
      </button>
      <button className="status-queue" onClick={() => onNavigate('/jobs')}>Queue: {queued}</button>
    </footer>
  )
}

export default memo(AppStatusBar)
