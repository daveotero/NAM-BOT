import { describe, expect, it } from 'vitest'

import { shouldAutoLoadResource, useAppStore, type AppSettings, type BackendValidationSummary } from './store'
import { buildBackendSettingsKey } from '../../shared/backend-settings'

describe('diagnostic auto-loading', () => {
  it('rejects broadcast results from a previously selected environment', () => {
    const settings: AppSettings = { condaExecutablePath: 'conda', backendMode: 'conda-name', environmentName: 'new-environment', environmentPrefixPath: null, defaultOutputRoot: null, defaultWorkspaceRoot: null, defaultPresetId: 'a2-packed-wavenet', autoOpenResultsFolder: false, defaultAuthorName: '', defaultAuthorUrl: '' }
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
