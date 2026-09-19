import { ipcMain } from 'electron'
import type { AcceleratorDiagnosticsSummary, BackendCheckResult, BackendValidationSummary, TrainingLaunchDiagnosticsSummary } from '../types'
import { isDesktopShellSmoke } from './smokeBootstrap'

/** Only used by isolated shell tests. No backend detection, network or training. */
export function installDesktopSmokeIpc(): void {
  if (!isDesktopShellSmoke) return
  const unchecked = (title: string): BackendCheckResult => ({ ok: false, code: 'unknown', title, message: 'Not checked' })
  const validation: BackendValidationSummary = {
    overallOk: false,
    checkedAt: new Date().toISOString(),
    condaReachable: { ok: false, code: 'conda_not_found', title: 'Conda', message: 'Desktop shell test' },
    environmentReachable: unchecked('Environment'),
    pythonReachable: unchecked('Python'),
    namInstalled: unchecked('NAM'),
    namFullAvailable: unchecked('NAM trainer')
  }
  const accelerator: AcceleratorDiagnosticsSummary = {
    checkedAt: validation.checkedAt, status: 'not_checked', issue: 'not_checked', headline: 'Desktop shell test', detail: 'Backend probes are disabled during shell tests.',
    pythonVersion: null, pythonExecutable: null, pythonPlatform: null, torchImportOk: null, torchVersion: null, torchCudaVersion: null, hipVersion: null,
    namVersion: null, lightningPackage: null, lightningVersion: null, cudaAvailable: null, cudaDeviceCount: null, deviceName: null, mpsAvailable: null,
    namImportOk: null, lightningImportOk: null, lightningCudaAvailable: null, hostNvidiaSmiAvailable: null, hostNvidiaGpuName: null, hostDriverVersion: null, errors: []
  }
  const launch: TrainingLaunchDiagnosticsSummary = {
    checkedAt: validation.checkedAt, status: 'not_checked', issue: 'not_checked', headline: 'Desktop shell test', detail: 'Training is disabled during shell tests.',
    workspaceRoot: null, workspacePath: null, appExecutablePath: null, processArch: process.arch, nodePtyHelperPath: null,
    nodePtyHelperExists: null, nodePtyHelperExecutable: null, nodePtyHelperMode: null, nodePtyHelperError: null, checks: [], errors: []
  }
  const fixtures: Record<string, unknown> = {
    'settings:detectConda': { found: false, executablePath: null, source: null },
    'settings:validate': validation,
    'settings:getAcceleratorDiagnostics': accelerator,
    'settings:getTrainingLaunchDiagnostics': launch,
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
