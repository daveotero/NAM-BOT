import { ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { loadSettings, saveSettings } from '../persistence/settingsStore'
import {
  detectCondaOnPath,
  getNamVersionInfo,
  inspectAcceleratorDiagnostics,
  inspectTrainingLaunchDiagnostics,
  validateBackend
} from '../backend/adapter'
import { AppSettings, BackendValidationSummary, NamVersionInfo } from '../types'
import { getQueueManager } from '../jobs/queueManager'
import { buildBackendSettingsKey } from '../../shared/backend-settings'
import { showOpenDialogFor } from './dialogs'

let cachedSettings: AppSettings | null = null
// The startup check and the Dashboard ask at the same moment; share one run per backend target.
const validationsInFlight = new Map<string, Promise<BackendValidationSummary>>()

export function getCurrentSettings(): AppSettings {
  cachedSettings ??= loadSettings()
  return cachedSettings
}

function validateAndBroadcast(): Promise<BackendValidationSummary> {
  const settings: AppSettings = cachedSettings || loadSettings()
  cachedSettings = settings
  const settingsKey = buildBackendSettingsKey(settings)
  const inFlight = validationsInFlight.get(settingsKey)
  if (inFlight) {
    return inFlight
  }

  const validation = (async (): Promise<BackendValidationSummary> => {
    const result = { ...await validateBackend(settings), settingsKey }
    if (cachedSettings && buildBackendSettingsKey(cachedSettings) === settingsKey) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('backend:validationUpdated', result)
      })
    }
    return result
  })().finally(() => {
    validationsInFlight.delete(settingsKey)
  })
  validationsInFlight.set(settingsKey, validation)
  return validation
}

export function setupIpcHandlers(): void {
  log.info('Setting up IPC handlers')

  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    try {
      if (!cachedSettings) {
        cachedSettings = loadSettings()
      }
      return cachedSettings
    } catch (error) {
      log.error('Failed to get settings:', error)
      throw error
    }
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    try {
      const normalizedSettings = saveSettings(settings)
      cachedSettings = normalizedSettings
      // Keep queue runner in sync with latest settings without requiring restart.
      getQueueManager().setSettings(normalizedSettings)
      log.info('Settings saved')
      return normalizedSettings
    } catch (error) {
      log.error('Failed to save settings:', error)
      throw error
    }
  })

  ipcMain.handle('settings:validate', async () => {
    try {
      return await validateAndBroadcast()
    } catch (error) {
      log.error('Failed to validate backend:', error)
      throw error
    }
  })

  ipcMain.handle('settings:detectConda', async () => {
    try {
      return await detectCondaOnPath()
    } catch (error) {
      log.error('Failed to detect Conda on PATH:', error)
      throw error
    }
  })

  ipcMain.handle('settings:getAcceleratorDiagnostics', async () => {
    try {
      const settings: AppSettings = cachedSettings || loadSettings()
      cachedSettings = settings
      return await inspectAcceleratorDiagnostics(settings)
    } catch (error) {
      log.error('Failed to inspect accelerator diagnostics:', error)
      throw error
    }
  })

  ipcMain.handle('settings:getTrainingLaunchDiagnostics', async () => {
    try {
      const settings: AppSettings = cachedSettings || loadSettings()
      cachedSettings = settings
      return await inspectTrainingLaunchDiagnostics(settings)
    } catch (error) {
      log.error('Failed to inspect training launch diagnostics:', error)
      throw error
    }
  })

  ipcMain.handle('settings:getNamVersionInfo', async (): Promise<NamVersionInfo> => {
    const settings: AppSettings = cachedSettings || loadSettings()
    cachedSettings = settings
    try {
      const result = await getNamVersionInfo(settings)
      getQueueManager().setKnownNamVersion(settings, result.installedVersion)
      return result
    } catch (error) {
      log.error('Failed to get NAM version info:', error)
      getQueueManager().setKnownNamVersion(settings, null)
      return {
        installedVersion: null,
        latestVersion: null,
        isUpToDate: null,
        latestReleaseUrl: null,
        publishedAt: null,
        checkStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('settings:chooseCondaPath', async (event) => {
    const result = await showOpenDialogFor(event, {
      title: 'Select Conda Executable',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Executable', extensions: ['exe', 'bat', 'cmd'] }, { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  ipcMain.handle('settings:chooseDirectory', async (event) => {
    const result = await showOpenDialogFor(event, {
      title: 'Select Directory',
      properties: ['openDirectory', 'createDirectory']
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  log.info('IPC handlers registered')
}

export async function validateBackendOnStartup(): Promise<void> {
  try {
    await validateAndBroadcast()
    log.info('Startup backend validation finished')
  } catch (error) {
    log.error('Startup backend validation failed:', error)
  }
}
