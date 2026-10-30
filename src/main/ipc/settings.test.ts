import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type AppSettings, type BackendValidationSummary } from '../types'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const harness = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  send: vi.fn(),
  validateBackend: vi.fn(),
  settings: null as AppSettings | null
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: harness.send } }], fromWebContents: () => null },
  ipcMain: { handle: (name: string, handler: Handler) => harness.handlers.set(name, handler) },
  dialog: {}
}))
vi.mock('electron-log/main', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../persistence/settingsStore', () => ({
  loadSettings: () => harness.settings,
  saveSettings: (settings: AppSettings) => settings
}))
vi.mock('../backend/adapter', () => ({
  detectCondaOnPath: vi.fn(),
  getNamVersionInfo: vi.fn(),
  inspectAcceleratorDiagnostics: vi.fn(),
  inspectTrainingLaunchDiagnostics: vi.fn(),
  validateBackend: harness.validateBackend
}))
vi.mock('../jobs/queueManager', () => ({
  getQueueManager: () => ({ setSettings: vi.fn(), setKnownNamVersion: vi.fn() })
}))

async function startIpc(): Promise<typeof import('./settings')> {
  vi.resetModules()
  harness.handlers.clear()
  const settingsIpc = await import('./settings')
  settingsIpc.setupIpcHandlers()
  return settingsIpc
}

beforeEach(() => {
  harness.send.mockReset()
  harness.validateBackend.mockReset()
  harness.settings = { ...defaultSettings }
})

describe('backend validation IPC', () => {
  it('shares one run between the startup check and a simultaneous Dashboard request', async () => {
    const { validateBackendOnStartup } = await startIpc()
    let finish: (summary: Partial<BackendValidationSummary>) => void = () => undefined
    harness.validateBackend.mockImplementation(() => new Promise((resolve) => { finish = resolve }))

    const startup = validateBackendOnStartup()
    const dashboard = harness.handlers.get('settings:validate')?.({})
    expect(harness.validateBackend).toHaveBeenCalledTimes(1)
    finish({ overallOk: true })
    await startup
    await expect(dashboard).resolves.toMatchObject({ overallOk: true })
    expect(harness.send).toHaveBeenCalledTimes(1)

    // A later request runs a new validation instead of reusing the finished one.
    harness.validateBackend.mockResolvedValue({ overallOk: false })
    await expect(harness.handlers.get('settings:validate')?.({})).resolves.toMatchObject({ overallOk: false })
    expect(harness.validateBackend).toHaveBeenCalledTimes(2)
  })
})
