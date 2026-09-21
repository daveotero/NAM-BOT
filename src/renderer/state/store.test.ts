import { afterEach, describe, expect, it, vi } from 'vitest'

import { shouldAutoLoadResource, useAppStore, type AppSettings, type BackendValidationSummary } from './store'
import { buildBackendSettingsKey } from '../../shared/backend-settings'

const initialState = useAppStore.getState()
afterEach(() => {
  useAppStore.setState(initialState, true)
  vi.unstubAllGlobals()
})

describe('settings diagnostic invalidation', () => {
  const settings: AppSettings = { condaExecutablePath: 'conda', backendMode: 'conda-name', environmentName: 'nam', environmentPrefixPath: null, defaultOutputRoot: null, defaultWorkspaceRoot: null, defaultPresetId: 'a2-packed-wavenet', autoOpenResultsFolder: false, notificationsEnabled: true, defaultAuthorName: '', defaultAuthorUrl: '' }
  const check = { ok: true, code: 'ok', title: 'Ready', message: 'Ready' }
  const validation: BackendValidationSummary = { settingsKey: buildBackendSettingsKey(settings), checkedAt: '2026-09-21', overallOk: true, condaReachable: check, environmentReachable: check, pythonReachable: check, namInstalled: check, namFullAvailable: check }

  it.each<Partial<AppSettings>>([
    { notificationsEnabled: false }, { autoOpenResultsFolder: true },
    { defaultPresetId: 'wavenet-lite' }, { defaultAuthorName: 'Studio' },
    { defaultAuthorUrl: 'https://example.com' }, { defaultOutputRoot: 'C:/models' }
  ])('preserves diagnostic results and errors for preference changes: %j', async (change) => {
    vi.stubGlobal('window', { namBot: { settings: { save: vi.fn(async (value: AppSettings) => value) } } })
    useAppStore.setState({ settings, settingsRevision: 4, validation, acceleratorDiagnosticsError: 'probe failed', trainingLaunchDiagnosticsError: 'launch failed', namVersionInfoError: 'offline' })
    await useAppStore.getState().saveSettings({ ...settings, ...change })
    expect(useAppStore.getState()).toMatchObject({ settings: { ...settings, ...change }, settingsRevision: 4, validation, acceleratorDiagnosticsError: 'probe failed', trainingLaunchDiagnosticsError: 'launch failed', namVersionInfoError: 'offline' })
  })

  it.each<Partial<AppSettings>>([
    { condaExecutablePath: 'other-conda' }, { environmentName: 'other' },
    { backendMode: 'conda-prefix', environmentPrefixPath: 'C:/env' },
    { defaultWorkspaceRoot: 'C:/workspace' }
  ])('invalidates diagnostics when their inputs change: %j', async (change) => {
    vi.stubGlobal('window', { namBot: { settings: { save: vi.fn(async (value: AppSettings) => value) } } })
    useAppStore.setState({ settings, settingsRevision: 4, validation, acceleratorDiagnosticsError: 'probe failed', trainingLaunchDiagnosticsError: 'launch failed', namVersionInfoError: 'offline' })
    await useAppStore.getState().saveSettings({ ...settings, ...change })
    expect(useAppStore.getState()).toMatchObject({ settingsRevision: 5, validation: null, acceleratorDiagnostics: null, trainingLaunchDiagnostics: null, namVersionInfo: null, acceleratorDiagnosticsError: null, trainingLaunchDiagnosticsError: null, namVersionInfoError: null })
  })
})

describe('diagnostic auto-loading', () => {
  it('rejects broadcast results from a previously selected environment', () => {
    const settings: AppSettings = { condaExecutablePath: 'conda', backendMode: 'conda-name', environmentName: 'new-environment', environmentPrefixPath: null, defaultOutputRoot: null, defaultWorkspaceRoot: null, defaultPresetId: 'a2-packed-wavenet', autoOpenResultsFolder: false, notificationsEnabled: true, defaultAuthorName: '', defaultAuthorUrl: '' }
    const check = { ok: true, code: 'ok', title: 'Ready', message: 'Ready' }
    const result: BackendValidationSummary = { settingsKey: buildBackendSettingsKey({ ...settings, environmentName: 'old-environment' }), checkedAt: new Date().toISOString(), overallOk: true, condaReachable: check, environmentReachable: check, pythonReachable: check, namInstalled: check, namFullAvailable: check }
    useAppStore.setState({ settings, validation: null, isSettingsSaving: false })
    useAppStore.getState().setValidation(result)
    expect(useAppStore.getState().validation).toBeNull()
    useAppStore.getState().setValidation({ ...result, settingsKey: buildBackendSettingsKey(settings) })
    expect(useAppStore.getState().validation?.overallOk).toBe(true)
  })
  it('loads an idle resource once', () => {
    expect(shouldAutoLoadResource(null, false, null)).toBe(true)
  })

  it('does not automatically retry a failed resource', () => {
    expect(shouldAutoLoadResource(null, false, 'probe failed')).toBe(false)
  })

  it('does not overlap an in-flight request', () => {
    expect(shouldAutoLoadResource(null, true, null)).toBe(false)
  })
})
