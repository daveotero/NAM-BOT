import { useState, useEffect, useRef } from 'react'
import { useAppStore, AppSettings } from '../../state/store'
import { formatPresetArchitectureTag } from '../../state/types'
import WorkspaceToolbar from '../../components/WorkspaceToolbar'
import PropertySheet, { PropertySection } from '../../components/PropertySheet'
import WorkingIndicator from '../../components/WorkingIndicator'

const SETTINGS_SECTIONS = [
  { id: 'settings-backend', label: 'Backend' },
  { id: 'settings-folders', label: 'Folders' },
  { id: 'settings-author', label: 'Author' },
  { id: 'settings-application', label: 'Application' }
]

export default function Settings() {
  const {
    settings,
    presets,
    presetsLoadError,
    validation,
    condaDiscovery,
    isSettingsSaving,
    isBackendValidationLoading,
    settingsSaveError,
    settingsLoadError,
    validationError,
    loadSettings,
    loadPresets,
    saveSettings,
    validateBackend,
    detectConda
  } = useAppStore()
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null)
  const [useCustomCondaPath, setUseCustomCondaPath] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const latestSettingsRef = useRef<AppSettings | null>(null)
  const persistedSettingsRef = useRef<AppSettings | null>(null)

  useEffect(() => {
    void loadSettings()
    void loadPresets()
    void detectConda()
  }, [detectConda, loadSettings, loadPresets])

  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings)
      setUseCustomCondaPath(
        Boolean(settings.condaExecutablePath && (settings.condaExecutablePath.includes('\\') || settings.condaExecutablePath.includes('/')))
      )
    }
  }, [settings, localSettings])

  useEffect(() => {
    latestSettingsRef.current = localSettings
    persistedSettingsRef.current = settings
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!localSettings || !settings || JSON.stringify(localSettings) === JSON.stringify(settings)) {
      return
    }

    const settingsSnapshot = localSettings
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveSettings(settingsSnapshot).then((saved) => {
        setLocalSettings((current) => current === settingsSnapshot ? saved : current)
      }).catch(() => undefined)
    }, 500)
  }, [localSettings, settings, saveSettings])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }
    const latestSettings = latestSettingsRef.current
    const persistedSettings = persistedSettingsRef.current
    if (latestSettings && JSON.stringify(latestSettings) !== JSON.stringify(persistedSettings)) {
      void saveSettings(latestSettings).catch(() => undefined)
    }
  }, [saveSettings])

  const handleSave = async (): Promise<boolean> => {
    if (!localSettings) {
      return false
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    try {
      const snapshot = localSettings
      const saved = await saveSettings(snapshot)
      setLocalSettings((current) => current === snapshot ? saved : current)
      return true
    } catch {
      return false
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (localSettings && JSON.stringify(localSettings) !== JSON.stringify(settings)) {
      const saved = await handleSave()
      if (!saved) {
        return
      }
    }
    await validateBackend()
  }

  const chooseCondaPath = async () => {
    try {
      setBrowseError(null)
      const path = await window.namBot.settings.chooseCondaPath()
      if (path) setLocalSettings((current) => current ? { ...current, condaExecutablePath: path } : current)
    } catch (error) {
      setBrowseError(String(error))
    }
  }

  const chooseDirectory = async (field: 'defaultOutputRoot' | 'defaultWorkspaceRoot') => {
    try {
      setBrowseError(null)
      const path = await window.namBot.settings.chooseDirectory()
      if (path) setLocalSettings((current) => current ? { ...current, [field]: path } : current)
    } catch (error) {
      setBrowseError(String(error))
    }
  }

  if (!localSettings) {
    return (
      <div className="layout-main">
        <WorkspaceToolbar title="Settings">{null}</WorkspaceToolbar>
        <div className="panel">
          {settingsLoadError ? <p role="alert">Could not load settings: {settingsLoadError} <button className="btn btn-secondary" onClick={() => void loadSettings()}>Retry</button></p>
            : <p style={{ color: 'var(--text-steel)' }}>Loading<WorkingIndicator /></p>}
        </div>
      </div>
    )
  }

  const usingPathConda: boolean = Boolean(condaDiscovery?.isOnPath && !useCustomCondaPath)
  const displayedCondaPath: string = usingPathConda
    ? (condaDiscovery?.resolvedPath || localSettings.condaExecutablePath || (window.namBot.platform === 'win32' ? 'conda.exe' : 'conda'))
    : (localSettings.condaExecutablePath || '')
  const hasUnsavedChanges = JSON.stringify(localSettings) !== JSON.stringify(settings)
  const isBackendBusy = isSettingsSaving || isBackendValidationLoading
  const visiblePresets = presets.filter((preset) => preset.visible)
  const defaultPresetUnavailable = !visiblePresets.some((preset) => preset.id === localSettings.defaultPresetId)

  return (
    <PropertySheet sections={SETTINGS_SECTIONS} navigationLabel="Settings sections" className="settings-workspace">
      <WorkspaceToolbar title="Settings">
        <span className={`settings-save-status${settingsSaveError ? ' is-error' : ''}`} role="status">
          {settingsSaveError ? `Save failed: ${settingsSaveError}` : isSettingsSaving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
        </span>
        <button type="button" className={`btn btn-sm ${hasUnsavedChanges ? 'btn-green' : 'btn-secondary'}`} disabled={!hasUnsavedChanges || isBackendBusy} onClick={() => void handleSave()}>
          Save Settings
        </button>
      </WorkspaceToolbar>
      <div className="panel editor-sheet">
        {browseError && <p role="alert" className="operation-error">Could not open the picker: {browseError}</p>}
        <PropertySection id="settings-backend" title="Backend">
          <div className="property-row">
            <label className="form-label" htmlFor="settings-conda">Conda Executable Path</label>
            <div className="property-control">
              {condaDiscovery?.isOnPath && (
                <div className="property-mode-controls" role="group" aria-label="Conda executable source">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    aria-pressed={!useCustomCondaPath}
                    onClick={() => {
                      setUseCustomCondaPath(false)
                      setLocalSettings({ ...localSettings, condaExecutablePath: window.namBot.platform === 'win32' ? 'conda.exe' : 'conda' })
                    }}
                  >
                    Use PATH
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    aria-pressed={useCustomCondaPath}
                    onClick={() => {
                      setUseCustomCondaPath(true)
                    }}
                  >
                    Custom Path
                  </button>
                </div>
              )}
              <div className="property-input-action">
                <input
                  id="settings-conda"
                  type="text"
                  className="form-input"
                  value={displayedCondaPath}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, condaExecutablePath: e.target.value || null })
                  }}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\miniconda3\\Scripts\\conda.exe' : '/opt/homebrew/bin/conda'}
                  disabled={usingPathConda}
                />
                <button className="btn btn-secondary" onClick={chooseCondaPath} disabled={usingPathConda}>
                  Browse
                </button>
              </div>
              {usingPathConda && condaDiscovery?.resolvedPath && (
                <p className="property-hint">
                  Using Conda from PATH: {condaDiscovery.resolvedPath}
                </p>
              )}
            </div>
          </div>

          <div className="property-row">
            <label className="form-label" htmlFor="settings-backend-mode">Backend Mode</label>
            <div className="property-control">
              <select
                id="settings-backend-mode"
                className="form-select"
                value={localSettings.backendMode}
                onChange={(e) => {
                  const backendMode = e.target.value
                  if (backendMode === 'conda-name' || backendMode === 'conda-prefix') setLocalSettings({ ...localSettings, backendMode })
                }}
              >
                <option value="conda-name">Conda Environment Name</option>
                <option value="conda-prefix">Conda Environment Prefix</option>
              </select>
            </div>
          </div>

          {localSettings.backendMode === 'conda-name' && (
            <div className="property-row">
              <label className="form-label" htmlFor="settings-environment-name">Environment Name</label>
              <div className="property-control">
                <input
                  id="settings-environment-name"
                  type="text"
                  className="form-input"
                  value={localSettings.environmentName || ''}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, environmentName: e.target.value || null })
                  }}
                  placeholder="nam"
                />
              </div>
            </div>
          )}

          {localSettings.backendMode === 'conda-prefix' && (
            <div className="property-row">
              <label className="form-label" htmlFor="settings-environment-prefix">Environment Prefix Path</label>
              <div className="property-control">
                <input
                  id="settings-environment-prefix"
                  type="text"
                  className="form-input"
                  value={localSettings.environmentPrefixPath || ''}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, environmentPrefixPath: e.target.value || null })
                  }}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\miniconda3\\envs\\nam' : '/path/to/miniconda3/envs/nam'}
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <button
              className="btn btn-green"
              onClick={handleValidate}
              disabled={isBackendBusy}
            >
              {isBackendValidationLoading ? 'Validating' : (!hasUnsavedChanges && validation?.overallOk ? '✓ Backend Ready' : 'Validate Backend')}
              <WorkingIndicator active={isBackendBusy} />
            </button>
            {validationError && (
              <p style={{ marginTop: '8px', color: 'var(--neon-magenta)', fontSize: '13px' }}>
                Validation failed: {validationError}
              </p>
            )}
          </div>
        </PropertySection>
        <PropertySection id="settings-folders" title="Folders">

          <div className="property-row">
            <label className="form-label" htmlFor="settings-output-root">Default Model Output Root</label>
            <div className="property-control">
              <div className="property-input-action">
                <input
                  id="settings-output-root"
                  type="text"
                  className="form-input"
                  value={localSettings.defaultOutputRoot || ''}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, defaultOutputRoot: e.target.value || null })
                  }}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\NAM\\outputs' : '/path/to/NAM/outputs'}
                />
                <button className="btn btn-secondary" onClick={() => chooseDirectory('defaultOutputRoot')}>
                  Browse
                </button>
              </div>
              <p className="property-hint">Default destination for new jobs. Each job can use a different folder.</p>
            </div>
          </div>

          <div className="property-row">
            <label className="form-label" htmlFor="settings-workspace-root">Workspace Root</label>
            <div className="property-control">
              <div className="property-input-action">
                <input
                  id="settings-workspace-root"
                  type="text"
                  className="form-input"
                  value={localSettings.defaultWorkspaceRoot || ''}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, defaultWorkspaceRoot: e.target.value || null })
                  }}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\nam-bot\\workspaces' : '/path/to/nam-bot/workspaces'}
                />
                <button className="btn btn-secondary" onClick={() => chooseDirectory('defaultWorkspaceRoot')}>
                  Browse
                </button>
              </div>
            </div>
          </div>
        </PropertySection>
        <PropertySection id="settings-author" title="Author defaults">

          <div className="property-row">
            <label className="form-label" htmlFor="settings-author-name">Default Author Name</label>
            <div className="property-control">
              <input
                id="settings-author-name"
                type="text"
                className="form-input"
                value={localSettings.defaultAuthorName || ''}
                onChange={(e) => {
                  setLocalSettings({ ...localSettings, defaultAuthorName: e.target.value })
                }}
                placeholder="Your name"
              />
            </div>
          </div>

          <div className="property-row">
            <label className="form-label" htmlFor="settings-author-url">Default Author URL</label>
            <div className="property-control">
              <input
                id="settings-author-url"
                type="text"
                className="form-input"
                value={localSettings.defaultAuthorUrl || ''}
                onChange={(e) => {
                  setLocalSettings({ ...localSettings, defaultAuthorUrl: e.target.value })
                }}
                placeholder="https://social.link/user or Tone 3000 profile"
              />
            </div>
          </div>
        </PropertySection>
        <PropertySection id="settings-application" title="Application">
          <div className="property-row">
            <label className="form-label" htmlFor="settings-default-preset">Default preset</label>
            <div className="property-control">
              <select
                id="settings-default-preset"
                className="form-select"
                value={localSettings.defaultPresetId}
                disabled={visiblePresets.length === 0}
                aria-describedby="settings-default-preset-hint"
                onChange={(event) => setLocalSettings({ ...localSettings, defaultPresetId: event.target.value })}
              >
                {defaultPresetUnavailable && <option value={localSettings.defaultPresetId} disabled>Unavailable preset</option>}
                {visiblePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{formatPresetArchitectureTag(preset)} · {preset.name}</option>
                ))}
              </select>
              <p id="settings-default-preset-hint" className="property-hint">
                {defaultPresetUnavailable
                  ? 'The selected preset is unavailable. New jobs use the app default.'
                  : 'Used for new jobs and dropped audio files.'}
              </p>
              {presetsLoadError && <p role="alert" className="operation-error">Could not load presets: {presetsLoadError} <button type="button" className="btn btn-sm btn-secondary" onClick={() => void loadPresets()}>Retry</button></p>}
            </div>
          </div>
          <div className="property-row">
            <span className="form-label">Results folder</span>
            <div className="property-control">
              <label className="property-check-option property-option-panel">
                <input
                  type="checkbox"
                  checked={localSettings.autoOpenResultsFolder}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, autoOpenResultsFolder: e.target.checked })
                  }}
                />
                <span className="label-text">Automatically open results folder after training</span>
              </label>
            </div>
          </div>

        </PropertySection>
      </div>
    </PropertySheet>
  )
}
