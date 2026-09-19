import { useCallback, useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import type { AppCommand } from '../shared/appShell'
import {
  type PresetEditorSession,
  useAppStore
} from './state/store'
import type { UpdateStatus } from '../shared/update'
import Settings from './features/settings/Settings'
import Diagnostics from './features/diagnostics/Diagnostics'
import Jobs from './features/jobs/Jobs'
import Help from './features/help/Help'
import Presets from './features/presets/Presets'
import About from './features/about/About'
import Dashboard from './features/dashboard/Dashboard'
import AppStatusBar from './components/AppStatusBar'
import AppDialogs from './components/AppDialogs'
import { getSectionLabel } from './components/title-bar-state'
import { buildJobEditorSession, createNewJobDraft, serializeJobEditorSession } from './features/jobs/jobEditorSession'
import { buildNewPresetDraft, buildPresetEditorSession } from './features/presets/presetEditorSession'
import ConfirmDialog from './components/ConfirmDialog'
import AppTitleBar from './components/AppTitleBar'
import WorkingIndicator from './components/WorkingIndicator'
import { WorkspaceToolbarContext } from './components/WorkspaceToolbar'
import { isActiveRuntime } from './features/jobs/job-helpers'

type PendingAppAction =
  | { type: 'navigate'; path: string }
  | { type: 'new-job' }
  | { type: 'new-preset' }

function serializePresetEditorSession(session: PresetEditorSession): string {
  return JSON.stringify({
    preset: session.preset,
    dataJson: session.dataJson,
    modelJson: session.modelJson,
    learningJson: session.learningJson,
    editorMode: session.editorMode,
    importJson: session.importJson
  })
}

function AppShell() {
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  const [commandsReady, setCommandsReady] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [pendingAction, setPendingAction] = useState<PendingAppAction | null>(null)
  const { isTraining } = useAppStore()
  const isLoading = useAppStore((state) => state.isLoading)
  const isBackendValidationLoading = useAppStore((state) => state.isBackendValidationLoading)
  const isAcceleratorDiagnosticsLoading = useAppStore((state) => state.isAcceleratorDiagnosticsLoading)
  const isTrainingLaunchDiagnosticsLoading = useAppStore((state) => state.isTrainingLaunchDiagnosticsLoading)
  const isNamVersionInfoLoading = useAppStore((state) => state.isNamVersionInfoLoading)
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const queue = useAppStore((state) => state.queue)
  const updateStatus = useAppStore((state) => state.updateStatus)
  const loadSettings = useAppStore((state) => state.loadSettings)
  const loadPresets = useAppStore((state) => state.loadPresets)
  const detectConda = useAppStore((state) => state.detectConda)
  const loadUpdateStatus = useAppStore((state) => state.loadUpdateStatus)
  const setValidation = useAppStore((state) => state.setValidation)
  const setUpdateStatus = useAppStore((state) => state.setUpdateStatus)
  const setIsTraining = useAppStore((state) => state.setIsTraining)
  const setJobEditorSession = useAppStore((state) => state.setJobEditorSession)
  const setPresetEditorSession = useAppStore((state) => state.setPresetEditorSession)
  const jobEditorSession = useAppStore((state) => state.jobEditorSession)
  const presetEditorSession = useAppStore((state) => state.presetEditorSession)
  const batchEditorSession = useAppStore((state) => state.batchEditorSession)
  const setBatchEditorSession = useAppStore((state) => state.setBatchEditorSession)
  const loadJobs = useAppStore((state) => state.loadJobs)
  const subscribeToJobEvents = useAppStore((state) => state.subscribeToJobEvents)
  const hasUpdateAvailable = updateStatus.state === 'update-available'
  const isDiagnosticsChecking = isLoading
    || isBackendValidationLoading
    || isAcceleratorDiagnosticsLoading
    || isTrainingLaunchDiagnosticsLoading
    || isNamVersionInfoLoading
  const hasUnsavedJobChanges = jobEditorSession != null
    && jobEditorSession.initialSnapshot !== serializeJobEditorSession(jobEditorSession)
  const hasUnsavedPresetChanges = presetEditorSession != null
    && presetEditorSession.initialSnapshot !== serializePresetEditorSession(presetEditorSession)
  const hasUnsavedEditorChanges = hasUnsavedJobChanges || hasUnsavedPresetChanges || batchEditorSession !== null

  const performAction = useCallback((action: PendingAppAction): void => {
    switch (action.type) {
      case 'navigate':
        navigate(action.path)
        return
      case 'new-job':
        setBatchEditorSession(null)
        setPresetEditorSession(null)
        setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
        navigate('/jobs')
        return
      case 'new-preset':
        setBatchEditorSession(null)
        setJobEditorSession(null)
        setPresetEditorSession(buildPresetEditorSession('New Preset', buildNewPresetDraft(settings)))
        navigate('/presets')
        return
      default:
        return
    }
  }, [navigate, presets, setJobEditorSession, setPresetEditorSession, setBatchEditorSession, settings])

  const requestAction = useCallback((action: PendingAppAction): boolean => {
    if (action.type === 'navigate' && action.path === location.pathname) {
      return true
    }

    if (!hasUnsavedEditorChanges) {
      performAction(action)
      return true
    }

    setPendingAction(action)
    return false
  }, [hasUnsavedEditorChanges, location.pathname, performAction])

  const handleConfirmNavigationDiscard = (): void => {
    if (!pendingAction) {
      return
    }

    const action = pendingAction
    setPendingAction(null)
    setJobEditorSession(null)
    setPresetEditorSession(null)
    setBatchEditorSession(null)
    performAction(action)
  }

  const handleCancelNavigationDiscard = (): void => {
    setPendingAction(null)
  }

  const buildGuardedNavClick = (path: string) => (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (!requestAction({ type: 'navigate', path })) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    let mounted = true
    void Promise.all([loadSettings(), loadPresets()]).then(() => {
      if (mounted) setCommandsReady(true)
    })
    void detectConda()
    void loadJobs()
    void loadUpdateStatus()
    
    const unsub = subscribeToJobEvents()
    return () => { mounted = false; unsub() }
  }, [detectConda, loadSettings, loadPresets, loadJobs, loadUpdateStatus, subscribeToJobEvents])

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
      isActiveRuntime(runtime.status)
    )
    setIsTraining(isActive)
  }, [queue, setIsTraining])

  useEffect(() => {
    if (!commandsReady) return
    return window.namBot.events.onAppCommand((command: AppCommand) => {
      switch (command.type) {
        case 'navigate':
          requestAction({ type: 'navigate', path: command.path })
          return
        case 'new-job':
          requestAction({ type: 'new-job' })
          return
        case 'new-preset':
          requestAction({ type: 'new-preset' })
          return
        default:
          return
      }
    })
  }, [commandsReady, requestAction])

  return (
    <>
      <AppTitleBar />

      <main className="desktop-workspace">
        <div className="layout-two-column">
          <nav className="nav-sidebar" aria-label="Main navigation">
            <div className="nav-group-label">Workspace</div>
            <NavLink to="/" onClick={buildGuardedNavClick('/')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/jobs" onClick={buildGuardedNavClick('/jobs')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Jobs
              <WorkingIndicator active={isTraining} />
            </NavLink>
            <NavLink to="/presets" onClick={buildGuardedNavClick('/presets')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Presets
            </NavLink>
            <div className="nav-system-group">
              <div className="nav-group-label">System</div>
              <NavLink to="/settings" onClick={buildGuardedNavClick('/settings')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                Settings
              </NavLink>
              <NavLink to="/diagnostics" onClick={buildGuardedNavClick('/diagnostics')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                Diagnostics
                <WorkingIndicator active={isDiagnosticsChecking} />
              </NavLink>
              <NavLink to="/help" onClick={buildGuardedNavClick('/help')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                Setup Guide
              </NavLink>
              <NavLink to="/about" onClick={buildGuardedNavClick('/about')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span>About</span>
                {hasUpdateAvailable && <span className="nav-update-indicator" aria-label="Update available" />}
              </NavLink>
            </div>
            <div className="nav-build-label">NAM-BOT <span>v{updateStatus.currentVersion}</span></div>
          </nav>

          <div className="workspace-body">
            <div className="workspace-toolbar" ref={setToolbarHost}>
              {location.pathname !== '/jobs' && location.pathname !== '/presets' && location.pathname !== '/settings' && location.pathname !== '/diagnostics' && (<>
              <div className="workspace-title"><span className="workspace-prompt" aria-hidden="true">&gt;</span><h1>{getSectionLabel(location.pathname)}</h1></div>
              <div className="workspace-toolbar-actions">
                {location.pathname === '/' ? <button className="btn btn-primary" title={`New job (${window.namBot.platform === 'darwin' ? '⌘N' : 'Ctrl+N'})`} onClick={() => requestAction({ type: 'new-job' })}>New job</button>
                  : null}
              </div>
              </>)}
            </div>
            <WorkspaceToolbarContext.Provider value={toolbarHost}>
            <div className="workspace-content">
                <Routes>
                  <Route path="/" element={<Dashboard onNavigate={path => requestAction({ type: 'navigate', path })} />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/presets" element={<Presets />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/diagnostics" element={<Diagnostics />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/about" element={<About />} />
                </Routes>
            </div>
            </WorkspaceToolbarContext.Provider>
          </div>
        </div>
      </main>
      <AppStatusBar onNavigate={path => requestAction({ type: 'navigate', path })} />

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title="Discard Unsaved Changes?"
        message="The current training or preset editor has unsaved changes. If you leave now, those changes will be lost."
        confirmLabel="Discard and Leave"
        cancelLabel="Keep Editing"
        onConfirm={handleConfirmNavigationDiscard}
        onCancel={handleCancelNavigationDiscard}
      />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
      <AppDialogs />
    </HashRouter>
  )
}
