import { ipcMain } from 'electron'
import { isDesktopShellSmoke } from './smokeBootstrap'

/** Only used by isolated shell tests. No backend detection, network or training. */
export function installDesktopSmokeIpc(): void {
  if (!isDesktopShellSmoke) return
  const fixtures: Record<string, unknown> = {
    'settings:detectConda': { found: false, executablePath: null, source: null },
    'settings:validate': { overallOk: false, checks: [], checkedAt: new Date().toISOString() },
    'settings:getAcceleratorDiagnostics': { status: 'not_checked', issue: 'not_checked', headline: 'Desktop shell test', errors: [] },
    'settings:getTrainingLaunchDiagnostics': { status: 'not_checked', issue: 'not_checked', headline: 'Desktop shell test', checks: [] },
    'settings:getNamVersionInfo': { installedVersion: null, latestVersion: null, isUpToDate: null, checkStatus: 'error', errorMessage: 'Desktop shell test' }
  }
  for (const [channel, value] of Object.entries(fixtures)) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, () => value)
  }
  for (const channel of ['jobs:enqueue', 'jobs:enqueueMany', 'jobs:resumeQueue', 'jobs:retry', 'jobs:exportModel']) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, () => { throw new Error('Training is disabled during desktop shell tests') })
  }
}
