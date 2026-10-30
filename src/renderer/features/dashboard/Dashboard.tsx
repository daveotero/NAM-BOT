import { useEffect, useRef, useState, type JSX } from 'react'
import log from 'electron-log/renderer'
import {
  type AcceleratorDiagnosticsSummary, type BackendValidationSummary,
  type NamVersionInfo, type TrainingLaunchDiagnosticsSummary,
  shouldAutoLoadResource, useAppStore
} from '../../state/store'
import { type JobRuntimeState, MIN_A2_NAM_VERSION } from '../../state/types'
import RuntimeCard from '../jobs/RuntimeCard'
import StopTrainingDialog, { findStoppableRuntime } from '../jobs/StopTrainingDialog'
import { isActiveRuntime } from '../jobs/job-helpers'
import { useTerminalLogs } from '../../hooks/useTerminalLogs'
import TrainingStatistics from './TrainingStatistics'
import DiagnosticSummaryCard, { type DiagnosticStatus, type DiagnosticSummary } from '../../components/DiagnosticSummaryCard'

interface DashboardProps {
  onNavigate: (path: string) => void
}

function getAcceleratorCardStatus(acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null): DiagnosticStatus {
  if (!acceleratorDiagnostics) {
    return 'skip'
  }

  switch (acceleratorDiagnostics.status) {
    case 'ready':
      return 'pass'
    case 'advisory':
      return 'warn'
    case 'cpu_only':
      return acceleratorDiagnostics.hostNvidiaSmiAvailable ? 'warn' : 'pass'
    case 'not_visible':
      return 'fail'
    case 'not_checked':
      return 'skip'
    case 'error':
    default:
      return 'fail'
  }
}

function getTrainingLaunchCardStatus(trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null): DiagnosticStatus {
  if (!trainingLaunchDiagnostics) {
    return 'skip'
  }

  switch (trainingLaunchDiagnostics.status) {
    case 'ready':
      return 'pass'
    case 'advisory':
      return 'warn'
    case 'not_checked':
      return 'skip'
    case 'error':
    default:
      return 'fail'
  }
}

function getNamVersionCardStatus(namVersionInfo: NamVersionInfo | null): DiagnosticStatus {
  if (!namVersionInfo) {
    return 'skip'
  }

  return namVersionInfo.checkStatus !== 'ok' || namVersionInfo.isUpToDate === false ? 'warn' : 'pass'
}

function getNamVersionCardLabel(namVersionInfo: NamVersionInfo | null): string {
  if (!namVersionInfo) {
    return 'Checking'
  }

  if (namVersionInfo.checkStatus !== 'ok') {
    return 'Unable to check'
  }

  if (namVersionInfo.installedVersion === null) {
    return 'Not detected'
  }

  if (namVersionInfo.isUpToDate === true) {
    return 'Up to date'
  }

  if (namVersionInfo.isUpToDate === false) {
    return 'Update available'
  }

  return 'Unknown'
}

function getDashboardDiagnosticsCards(
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null,
  namVersionInfo: NamVersionInfo | null
): DiagnosticSummary[] {
  return [
    {
      title: 'Backend',
      status: validation ? (validation.overallOk ? 'pass' : 'fail') : 'skip',
      label: validation ? (validation.overallOk ? 'Ready' : 'Needs Fix') : 'Checking',
      detail: validation ? (validation.overallOk ? 'Conda, Python, NAM, and nam-full are reachable.' : 'One or more backend checks failed.') : 'Waiting for backend validation.',
      checkedAt: validation?.checkedAt ?? null
    },
    {
      title: 'Accelerator',
      status: getAcceleratorCardStatus(acceleratorDiagnostics),
      label: acceleratorDiagnostics
        ? acceleratorDiagnostics.status === 'ready'
          ? 'GPU Ready'
          : acceleratorDiagnostics.status === 'cpu_only' && !acceleratorDiagnostics.hostNvidiaSmiAvailable
          ? 'CPU Ready'
          : acceleratorDiagnostics.status === 'advisory'
          ? 'Check Setup'
          : acceleratorDiagnostics.status === 'not_checked'
          ? 'Checking'
          : 'Needs Fix'
        : 'Checking',
      detail: acceleratorDiagnostics?.headline ?? 'Waiting for accelerator diagnostics.',
      checkedAt: acceleratorDiagnostics?.checkedAt ?? null
    },
    {
      title: 'Training Launch',
      status: getTrainingLaunchCardStatus(trainingLaunchDiagnostics),
      label: trainingLaunchDiagnostics
        ? trainingLaunchDiagnostics.status === 'ready'
          ? 'Ready'
          : trainingLaunchDiagnostics.status === 'advisory'
          ? 'Check Setup'
          : trainingLaunchDiagnostics.status === 'not_checked'
          ? 'Checking'
          : 'Blocked'
        : 'Checking',
      detail: trainingLaunchDiagnostics?.headline ?? 'Waiting for launch readiness diagnostics.',
      checkedAt: trainingLaunchDiagnostics?.checkedAt ?? null
    },
    {
      title: 'NAM Version',
      status: getNamVersionCardStatus(namVersionInfo),
      label: getNamVersionCardLabel(namVersionInfo),
      detail: namVersionInfo?.checkStatus === 'ok'
        ? `${namVersionInfo.installedVersion ? `Installed ${namVersionInfo.installedVersion}` : 'Not detected in the selected environment'}; latest ${namVersionInfo.latestVersion ?? 'unknown'}. A2 training requires ${MIN_A2_NAM_VERSION}+.`
        : namVersionInfo?.errorMessage ?? 'Waiting for version check.',
      checkedAt: null
    }
  ]
}

export default function Dashboard({ onNavigate }: DashboardProps): JSX.Element {
  const validation = useAppStore((state) => state.validation)
  const acceleratorDiagnostics = useAppStore((state) => state.acceleratorDiagnostics)
  const trainingLaunchDiagnostics = useAppStore((state) => state.trainingLaunchDiagnostics)
  const namVersionInfo = useAppStore((state) => state.namVersionInfo)
  const isBackendValidationLoading = useAppStore((state) => state.isBackendValidationLoading)
  const isAcceleratorDiagnosticsLoading = useAppStore((state) => state.isAcceleratorDiagnosticsLoading)
  const isTrainingLaunchDiagnosticsLoading = useAppStore((state) => state.isTrainingLaunchDiagnosticsLoading)
  const isNamVersionInfoLoading = useAppStore((state) => state.isNamVersionInfoLoading)
  const validationError = useAppStore((state) => state.validationError)
  const acceleratorDiagnosticsError = useAppStore((state) => state.acceleratorDiagnosticsError)
  const trainingLaunchDiagnosticsError = useAppStore((state) => state.trainingLaunchDiagnosticsError)
  const namVersionInfoError = useAppStore((state) => state.namVersionInfoError)
  const validateBackend = useAppStore((state) => state.validateBackend)
  const loadAcceleratorDiagnostics = useAppStore((state) => state.loadAcceleratorDiagnostics)
  const loadTrainingLaunchDiagnostics = useAppStore((state) => state.loadTrainingLaunchDiagnostics)
  const loadNamVersionInfo = useAppStore((state) => state.loadNamVersionInfo)
  const draftCount = useAppStore((state) => state.drafts.length)
  const queue = useAppStore((state) => state.queue)
  const presets = useAppStore((state) => state.presets)
  const loadPresets = useAppStore((state) => state.loadPresets)

  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())
  const [visibleLogJobIds, setVisibleLogJobIds] = useState<Set<string>>(new Set())
  const { logContents, logErrors, loadingLogIds, loadTerminalLog } = useTerminalLogs(queue)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [pendingStopJobId, setPendingStopJobId] = useState<string | null>(null)
  const [exportingJobId, setExportingJobId] = useState<string | null>(null)
  const [stopError, setStopError] = useState<{ jobId: string; message: string } | null>(null)
  const pendingStopJob = findStoppableRuntime(queue, pendingStopJobId)

  const stopTraining = async (jobId: string, label: string, action: () => Promise<unknown>): Promise<void> => {
    setStopError(null)
    try {
      await action()
    } catch (error) {
      log.error(`${label} failed from the Dashboard:`, error)
      setStopError({ jobId, message: `${label} failed: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  const saveAndStop = async (jobId: string): Promise<void> => {
    setExportingJobId(jobId)
    try {
      await stopTraining(jobId, 'Save and stop training', () => window.namBot.jobs.exportModel(jobId, true))
    } finally {
      setExportingJobId(null)
    }
  }

  const diagnosticsCards = getDashboardDiagnosticsCards(
    validation,
    acceleratorDiagnostics,
    trainingLaunchDiagnostics,
    namVersionInfo
  )

  const trainingJobs = queue.filter(r => isActiveRuntime(r.status))
  // A stop error belongs to its run and disappears once that run is no longer active.
  const visibleStopError = stopError && trainingJobs.some(job => job.jobId === stopError.jobId) ? stopError.message : null
  const queuedJobs = queue.filter(r => r.status === 'queued' || r.status === 'validating')
  const completedJobs = queue.filter(r => r.status === 'succeeded')
  const errorJobs = queue.filter(r => r.status === 'failed' || r.status === 'canceled')

  useEffect(() => {
    if (trainingJobs.length === 0) {
      return
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [trainingJobs.length])

  useEffect(() => {
    if (shouldAutoLoadResource(validation, isBackendValidationLoading, validationError)) {
      void validateBackend()
    }
    if (shouldAutoLoadResource(acceleratorDiagnostics, isAcceleratorDiagnosticsLoading, acceleratorDiagnosticsError)) {
      void loadAcceleratorDiagnostics()
    }
    if (shouldAutoLoadResource(trainingLaunchDiagnostics, isTrainingLaunchDiagnosticsLoading, trainingLaunchDiagnosticsError)) {
      void loadTrainingLaunchDiagnostics()
    }
    if (shouldAutoLoadResource(namVersionInfo, isNamVersionInfoLoading, namVersionInfoError)) {
      void loadNamVersionInfo()
    }
    if (presets.length === 0) {
      void loadPresets()
    }
  }, [
    acceleratorDiagnostics,
    acceleratorDiagnosticsError,
    isAcceleratorDiagnosticsLoading,
    isBackendValidationLoading,
    isNamVersionInfoLoading,
    isTrainingLaunchDiagnosticsLoading,
    loadAcceleratorDiagnostics,
    loadNamVersionInfo,
    loadPresets,
    loadTrainingLaunchDiagnostics,
    namVersionInfo,
    namVersionInfoError,
    presets.length,
    trainingLaunchDiagnostics,
    trainingLaunchDiagnosticsError,
    validation,
    validationError,
    validateBackend
  ])

  const stats = [
    { label: 'Drafts', count: draftCount, color: 'var(--text-steel)' },
    { label: 'Queued', count: queuedJobs.length, color: 'var(--neon-cyan)' },
    { label: 'Training', count: trainingJobs.length, color: 'var(--neon-gold)' },
    { label: 'Completed', count: completedJobs.length, color: 'var(--neon-green)' },
    { label: 'Errors', count: errorJobs.length, color: 'var(--neon-magenta)' }
  ]

  const toggleExpanded = (jobId: string): void => {
    setExpandedJobIds(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const toggleLogs = async (runtime: JobRuntimeState): Promise<void> => {
    const { jobId } = runtime
    if (visibleLogJobIds.has(jobId)) {
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      return
    }

    try {
      await loadTerminalLog(jobId)
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.add(jobId)
        return next
      })
    } catch (err) {
      log.error('Failed to load log for dashboard:', err)
    }
  }

  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => {
    if (visibleLogJobIds.size === 0) {
      return
    }

    const interval = window.setInterval(() => {
      for (const runtime of queueRef.current) {
        if (visibleLogJobIds.has(runtime.jobId)
          && isActiveRuntime(runtime.status)) {
          void loadTerminalLog(runtime.jobId)
        }
      }
    }, 1500)

    return () => window.clearInterval(interval)
  }, [loadTerminalLog, visibleLogJobIds])

  return (
    <div className="layout-main dashboard-console">
      <div className="console-counters" aria-label="Job counts">
        {stats.map(stat => (
          <div key={stat.label} className="console-counter">
            <span>{stat.label}</span>
            <strong style={{ color: stat.count > 0 ? stat.color : 'var(--text-steel)' }}>{String(stat.count).padStart(2, '0')}</strong>
          </div>
        ))}
      </div>
      <div className="dashboard-panels">
        {trainingJobs.length > 0 && (
          <div className="console-panel live-training-panel">
            <div className="console-panel-heading">
              <h3 style={{ color: 'var(--neon-gold)' }}>Active Training</h3>
            </div>
            {visibleStopError && <p role="alert" className="operation-error live-training-error">{visibleStopError}</p>}
            <div className="job-list">
              {trainingJobs.map(job => (
                <RuntimeCard
                  key={job.jobId}
                  runtime={job}
                  presets={presets}
                  nowMs={nowMs}
                  isExpanded={expandedJobIds.has(job.jobId)}
                  isLogsVisible={visibleLogJobIds.has(job.jobId)}
                  terminalLog={logErrors[job.jobId] || logContents[job.jobId] || ''}
                  isLoadingLog={loadingLogIds.has(job.jobId)}
                  onToggleExpanded={toggleExpanded}
                  onToggleLogs={toggleLogs}
                  onCancel={async (id: string) => { setPendingStopJobId(id) }}
                  onForceStop={async (id: string) => { await window.namBot.jobs.forceStop(id) }}
                  onOpenFolder={async (id: string) => { await window.namBot.jobs.openResultFolder(id) }}
                  onOpenArtifact={async (id, target) => { await window.namBot.jobs.openArtifact(id, target) }}
                />
              ))}
            </div>
          </div>
        )}

        <TrainingStatistics />
        <section className="console-panel" aria-label="Diagnostics summary">
          <div className="console-panel-heading"><h2>Diagnostics</h2><button className="console-link" onClick={() => onNavigate('/diagnostics')}>Open diagnostics →</button></div>
          <div className="diagnostic-summary-grid dashboard-diagnostics">
            {diagnosticsCards.map(card => <DiagnosticSummaryCard key={card.title} summary={card} />)}
          </div>
        </section>
      </div>
      <StopTrainingDialog
        runtime={pendingStopJob}
        exportInProgress={exportingJobId !== null}
        onKeepTraining={() => setPendingStopJobId(null)}
        onSaveAndStop={(id) => {
          setPendingStopJobId(null)
          void saveAndStop(id)
        }}
        onDiscardAndStop={(id) => {
          setPendingStopJobId(null)
          void stopTraining(id, 'Stop training', () => window.namBot.jobs.forceStop(id))
        }}
      />
    </div>
  )
}
