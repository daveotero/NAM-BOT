import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom'

import type { AppCommand } from '../shared/appShell'
import {
  AcceleratorDiagnosticsSummary,
  BackendValidationSummary,
  NamVersionInfo,
  TrainingLaunchDiagnosticsSummary,
  useAppStore
} from './state/store'
import type { UpdateStatus } from '../shared/update'
import { JobRuntimeState, MIN_A2_NAM_VERSION } from './state/types'
import Settings from './features/settings/Settings'
import Diagnostics from './features/diagnostics/Diagnostics'
import Jobs from './features/jobs/Jobs'
import Help from './features/help/Help'
import Presets from './features/presets/Presets'
import About from './features/about/About'
import RuntimeCard from './features/jobs/RuntimeCard'
import { buildJobEditorSession, createNewJobDraft } from './features/jobs/jobEditorSession'
import { buildNewPresetDraft, buildPresetEditorSession } from './features/presets/presetEditorSession'
import log from 'electron-log/renderer'

type DashboardDiagnosticsStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface DashboardDiagnosticsCard {
  title: string
  status: DashboardDiagnosticsStatus
  label: string
  detail: string
  checkedAt: string | null
}

function getDashboardStatusColor(status: DashboardDiagnosticsStatus): string {
  switch (status) {
    case 'pass':
      return 'var(--neon-green)'
    case 'warn':
      return 'var(--neon-cyan)'
    case 'fail':
      return 'var(--neon-magenta)'
    case 'skip':
    default:
      return 'var(--text-steel)'
  }
}

function getDashboardStatusLabel(status: DashboardDiagnosticsStatus): string {
  switch (status) {
    case 'pass':
      return 'PASS'
    case 'warn':
      return 'CHECK'
    case 'fail':
      return 'FAIL'
    case 'skip':
    default:
      return 'SKIP'
  }
}

function getAcceleratorCardStatus(acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null): DashboardDiagnosticsStatus {
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

function getTrainingLaunchCardStatus(trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null): DashboardDiagnosticsStatus {
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

function getNamVersionCardStatus(namVersionInfo: NamVersionInfo | null): DashboardDiagnosticsStatus {
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
): DashboardDiagnosticsCard[] {
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
        ? `Installed ${namVersionInfo.installedVersion ?? 'unknown'}; latest ${namVersionInfo.latestVersion ?? 'unknown'}. A2 training requires ${MIN_A2_NAM_VERSION}+.`
        : namVersionInfo?.errorMessage ?? 'Waiting for version check.',
      checkedAt: null
    }
  ]
}

function DashboardDiagnosticsCardView({ card }: { card: DashboardDiagnosticsCard }) {
  const color = getDashboardStatusColor(card.status)

  return (
    <div style={{
      border: `2px solid ${color}`,
      backgroundColor: 'rgba(9, 9, 11, 0.55)',
      padding: '12px',
      minHeight: '118px',
      display: 'grid',
      alignContent: 'space-between',
      gap: '8px'
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline', marginBottom: '8px' }}>
          <p style={{ color: 'var(--text-steel)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{card.title}</p>
          <span style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '16px' }}>{getDashboardStatusLabel(card.status)}</span>
        </div>
        <p style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '22px', lineHeight: 1.05, marginBottom: '6px' }}>{card.label}</p>
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', lineHeight: 1.35 }}>{card.detail}</p>
      </div>
      <p style={{ color: 'var(--text-steel)', fontSize: '10px' }}>{card.checkedAt ? `Checked ${new Date(card.checkedAt).toLocaleTimeString()}` : 'Not checked yet'}</p>
    </div>
  )
}

function Dashboard() {
  const { 
    validation, 
    acceleratorDiagnostics, 
    trainingLaunchDiagnostics,
    namVersionInfo,
    isLoading,
    isAcceleratorDiagnosticsLoading,
    isTrainingLaunchDiagnosticsLoading,
    isNamVersionInfoLoading,
    validateBackend,
    loadAcceleratorDiagnostics, 
    loadTrainingLaunchDiagnostics,
    loadNamVersionInfo,
    drafts, 
    queue,
    presets,
    loadPresets
  } = useAppStore()
  
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())
  const [visibleLogJobIds, setVisibleLogJobIds] = useState<Set<string>>(new Set())
  const [logContents, setLogContents] = useState<Record<string, string>>({})
  const [loadingLogs, setLoadingLogs] = useState<Set<string>>(new Set())
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  const diagnosticsCards = getDashboardDiagnosticsCards(
    validation,
    acceleratorDiagnostics,
    trainingLaunchDiagnostics,
    namVersionInfo
  )

  const trainingJobs = queue.filter(r => r.status === 'preparing' || r.status === 'running' || r.status === 'stopping')
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
    if (!validation && !isLoading) {
      void validateBackend()
    }
    if (!acceleratorDiagnostics && !isAcceleratorDiagnosticsLoading) {
      void loadAcceleratorDiagnostics()
    }
    if (!trainingLaunchDiagnostics && !isTrainingLaunchDiagnosticsLoading) {
      void loadTrainingLaunchDiagnostics()
    }
    if (!namVersionInfo && !isNamVersionInfoLoading) {
      void loadNamVersionInfo()
    }
    if (presets.length === 0) {
      void loadPresets()
    }
  }, [
    acceleratorDiagnostics,
    isAcceleratorDiagnosticsLoading,
    isLoading,
    isNamVersionInfoLoading,
    isTrainingLaunchDiagnosticsLoading,
    loadAcceleratorDiagnostics,
    loadNamVersionInfo,
    loadPresets,
    loadTrainingLaunchDiagnostics,
    namVersionInfo,
    presets.length,
    trainingLaunchDiagnostics,
    validation,
    validateBackend
  ])

  const stats = [
    { label: 'Drafts', count: drafts.length, color: 'var(--text-steel)' },
    { label: 'Queued', count: queuedJobs.length, color: 'var(--neon-cyan)' },
    { label: 'Training', count: trainingJobs.length, color: 'var(--neon-gold)' },
    { label: 'Completed', count: completedJobs.length, color: 'var(--neon-green)' },
    { label: 'Errors', count: errorJobs.length, color: 'var(--neon-magenta)' }
  ]

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const toggleLogs = async (runtime: JobRuntimeState) => {
    const { jobId } = runtime
    if (visibleLogJobIds.has(jobId)) {
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      return
    }

    setLoadingLogs(prev => {
      const next = new Set(prev)
      next.add(jobId)
      return next
    })
    try {
      const logContent = await window.namBot.logs.getTerminal(jobId)
      setLogContents(prev => ({ ...prev, [jobId]: logContent }))
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.add(jobId)
        return next
      })
    } catch (err) {
      log.error('Failed to load log for dashboard:', err)
    } finally {
      setLoadingLogs(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Jobs Overview</h3>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '8px',
          marginBottom: '16px'
        }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              padding: '8px',
              border: `1px solid ${stat.count > 0 ? stat.color : 'rgba(255,255,255,0.08)'}`,
              backgroundColor: 'rgba(9, 9, 11, 0.45)',
              textAlign: 'center'
            }}>
              <p style={{
                color: 'var(--text-steel)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: '4px'
              }}>
                {stat.label}
              </p>
              <p style={{
                color: stat.count > 0 ? stat.color : 'var(--text-steel)',
                fontFamily: 'var(--font-arcade)',
                fontSize: stat.count > 99 ? '18px' : '22px',
                margin: 0
              }}>
                {stat.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      {trainingJobs.length > 0 && (
        <div className="panel" style={{ marginBottom: '16px' }}>
          <div className="panel-header">
            <h3 className="processing-text" style={{ color: 'var(--neon-gold)' }}>Active Training</h3>
          </div>
          <div className="job-list" style={{ marginTop: '12px' }}>
             {trainingJobs.map(job => (
               <RuntimeCard
                  key={job.jobId}
                  runtime={job}
                  presets={presets}
                  nowMs={nowMs}
                 isExpanded={expandedJobIds.has(job.jobId)}
                 isLogsVisible={visibleLogJobIds.has(job.jobId)}
                 terminalLog={logContents[job.jobId] || ''}
                 isLoadingLog={loadingLogs.has(job.jobId)}
                 onToggleExpanded={toggleExpanded}
                 onToggleLogs={toggleLogs}
                 onCancel={async (id: string) => { await window.namBot.jobs.cancel(id) }}
                 onForceStop={async (id: string) => { await window.namBot.jobs.forceStop(id) }}
                 onRetry={async (id: string) => { await window.namBot.jobs.retry(id) }}
                 onOpenFolder={async (id: string) => { await window.namBot.jobs.openResultFolder(id) }}
               />
             ))}
          </div>
        </div>
      )}

      {/* ── END LIVE TRAINING ── */}

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Diagnostics</h3>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px'
        }}>
          {diagnosticsCards.map((card) => <DashboardDiagnosticsCardView key={card.title} card={card} />)}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a href="#/settings" className="btn btn-primary">Configure Backend</a>
          <a href="#/diagnostics" className="btn btn-green">Run Diagnostics</a>
          <a href="#/jobs" className="btn btn-secondary">Create Job</a>
        </div>
      </div>
    </div>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const { isTraining } = useAppStore()
  const isLoading = useAppStore((state) => state.isLoading)
  const isAcceleratorDiagnosticsLoading = useAppStore((state) => state.isAcceleratorDiagnosticsLoading)
  const isTrainingLaunchDiagnosticsLoading = useAppStore((state) => state.isTrainingLaunchDiagnosticsLoading)
  const isNamVersionInfoLoading = useAppStore((state) => state.isNamVersionInfoLoading)
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const queue = useAppStore((state) => state.queue)
  const updateStatus = useAppStore((state) => state.updateStatus)
  const loadSettings = useAppStore((state) => state.loadSettings)
  const detectConda = useAppStore((state) => state.detectConda)
  const loadUpdateStatus = useAppStore((state) => state.loadUpdateStatus)
  const setValidation = useAppStore((state) => state.setValidation)
  const setUpdateStatus = useAppStore((state) => state.setUpdateStatus)
  const setIsTraining = useAppStore((state) => state.setIsTraining)
  const setJobEditorSession = useAppStore((state) => state.setJobEditorSession)
  const setPresetEditorSession = useAppStore((state) => state.setPresetEditorSession)
  const loadJobs = useAppStore((state) => state.loadJobs)
  const subscribeToJobEvents = useAppStore((state) => state.subscribeToJobEvents)
  const hasUpdateAvailable = updateStatus.state === 'update-available'
  const isDiagnosticsChecking = isLoading
    || isAcceleratorDiagnosticsLoading
    || isTrainingLaunchDiagnosticsLoading
    || isNamVersionInfoLoading

  useEffect(() => {
    void loadSettings()
    void detectConda()
    void loadJobs()
    void loadUpdateStatus()
    
    const unsub = subscribeToJobEvents()
    return unsub
  }, [detectConda, loadSettings, loadJobs, loadUpdateStatus, subscribeToJobEvents])

  useEffect(() => {
    return window.namBot.events.onBackendValidationUpdated((summary: unknown) => {
      setValidation(summary as Parameters<typeof setValidation>[0])
    })
  }, [setValidation])

  useEffect(() => {
    return window.namBot.events.onUpdateStatusChanged((status: UpdateStatus) => {
      setUpdateStatus(status)
    })
  }, [setUpdateStatus])

  useEffect(() => {
    const isActive = queue.some((runtime) =>
      runtime.status === 'preparing' || runtime.status === 'running' || runtime.status === 'stopping'
    )
    setIsTraining(isActive)
  }, [queue, setIsTraining])

  useEffect(() => {
    return window.namBot.events.onAppCommand((command: AppCommand) => {
      switch (command.type) {
        case 'navigate':
          navigate(command.path)
          return
        case 'new-job':
          setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
          navigate('/jobs')
          return
        case 'new-preset':
          setPresetEditorSession(buildPresetEditorSession('New Preset', buildNewPresetDraft(settings)))
          navigate('/presets')
          return
        default:
          return
      }
    })
  }, [navigate, presets, setJobEditorSession, setPresetEditorSession, settings])

  return (
    <>
      <header>
        <h1>NAM-BOT</h1>
        <p className="subtitle">Neural Amp Modeler Training Manager</p>
      </header>

      <main>
        <div className="layout-two-column">
          <nav className="nav-sidebar">
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/jobs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${isTraining ? 'processing-text' : ''}`}>
              Jobs
            </NavLink>
            <NavLink to="/presets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Presets
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Settings
            </NavLink>
            <NavLink to="/diagnostics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${isDiagnosticsChecking ? 'processing-text' : ''}`}>
              Diagnostics
            </NavLink>
            <NavLink to="/help" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Setup Guide
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span>About</span>
              {hasUpdateAvailable && <span className="nav-update-indicator" aria-label="Update available" />}
            </NavLink>
          </nav>

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/presets" element={<Presets />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/help" element={<Help />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </main>
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  )
}
