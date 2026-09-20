import { mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrainingPreset, defaultJobSpec, normalizeJobSpec, type JobRuntimeState, type JobSpec } from '../../shared/training'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const harness = vi.hoisted(() => ({
  root: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-job-ipc-${Date.now()}-${Math.random()}`,
  handlers: new Map<string, Handler>(),
  failDraftWrites: false,
  showSaveDialog: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => harness.root, getVersion: () => '0.6.5' },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  ipcMain: { handle: (name: string, handler: Handler) => harness.handlers.set(name, handler) },
  dialog: { showSaveDialog: harness.showSaveDialog }, shell: {}
}))
vi.mock('../backend/adapter', () => ({ compareVersions: () => 0 }))
vi.mock('../persistence/atomicFile', async (importOriginal) => {
  const original = await importOriginal<typeof import('../persistence/atomicFile')>()
  return {
    ...original,
    atomicWriteJsonSync: (path: string, value: unknown): void => {
      if (harness.failDraftWrites && path.endsWith('drafts.json')) throw new Error('Draft storage unavailable')
      original.atomicWriteJsonSync(path, value)
    }
  }
})

async function startIpc(): Promise<void> {
  vi.resetModules()
  harness.handlers.clear()
  const { setupJobIpcHandlers } = await import('./jobs')
  setupJobIpcHandlers()
}

async function invoke(name: string, ...args: unknown[]): Promise<unknown> {
  const handler = harness.handlers.get(name)
  if (!handler) throw new Error(`Missing handler ${name}`)
  return await handler({}, ...args)
}

function draftInput(name: string): Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...structuredClone(defaultJobSpec), name, inputAudioPath: join(harness.root, 'input.wav'), outputAudioPath: join(harness.root, `${name}.wav`), outputRootDir: join(harness.root, 'models') }
}

beforeEach(async () => {
  rmSync(harness.root, { recursive: true, force: true })
  mkdirSync(harness.root, { recursive: true })
  harness.failDraftWrites = false
  harness.showSaveDialog.mockReset()
  await startIpc()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  rmSync(harness.root, { recursive: true, force: true })
})

describe('draft/queue IPC durability', () => {
  it('does not leave a hidden draft behind after a failed save and retry', async () => {
    harness.failDraftWrites = true
    await expect(invoke('jobs:createDraft', draftInput('retry-save'))).rejects.toThrow('Draft storage unavailable')
    expect(await invoke('jobs:listDrafts')).toEqual([])
    harness.failDraftWrites = false
    await invoke('jobs:createDraft', draftInput('retry-save'))
    expect(await invoke('jobs:listDrafts')).toHaveLength(1)
  })
  it('retries the same template batch without counting its source as a generated draft', async () => {
    const source = normalizeJobSpec(await invoke('jobs:createDraft', draftInput('source')))
    const request = { batchId: 'batch-retry', batchSourceName: 'Template', source: { kind: 'draft', id: source.id }, drafts: [draftInput('first'), draftInput('second')] }
    const created = await invoke('jobs:createDraftBatch', request)
    expect(await invoke('jobs:createDraftBatch', request)).toEqual(created)
    expect(await invoke('jobs:listDrafts')).toHaveLength(3)
  })

  it.each([false, true])('keeps queued jobs durable if restoring drafts fails (all=%s), and completes recovery after restart', async (all) => {
    const draft = normalizeJobSpec(await invoke('jobs:createDraft', draftInput('restore-me')))
    await invoke('jobs:enqueue', draft.id)
    const { getQueueManager } = await import('../jobs/queueManager')
    await vi.waitFor(() => expect(getQueueManager().isQueueProcessing()).toBe(false))
    const runtime = getQueueManager().getQueue()[0]
    harness.failDraftWrites = true
    await expect(invoke(all ? 'jobs:unqueueAll' : 'jobs:unqueue', runtime.jobId)).rejects.toThrow('Draft storage unavailable')
    expect(JSON.parse(readFileSync(join(harness.root, 'queue.json'), 'utf-8'))).toHaveLength(1)
    harness.failDraftWrites = false
    await startIpc()
    expect(await invoke('jobs:listQueue')).toEqual([])
    expect(await invoke('jobs:listDrafts')).toMatchObject([{ name: 'restore-me' }])
  })
})

describe('snapshot save dialog', () => {
  it.each([false, true])('uses the frozen run naming options and preserves the chosen path (finish=%s)', async (finish) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 19, 14, 32, 8, 456))
    const { getQueueManager } = await import('../jobs/queueManager')
    const manager = getQueueManager()
    const frozenJob = normalizeJobSpec({ ...draftInput('My Amp'), id: 'snapshot-run', presetId: 'studio', appendPresetToModelFileName: true, appendEsrToModelFileName: true })
    const runtime: JobRuntimeState = {
      jobId: frozenJob.id, jobName: 'Display name is not the naming source', status: 'running', pid: 123,
      frozenJob, frozenPreset: createTrainingPreset({ id: 'studio', name: 'Original Studio' }),
      resolvedRunDirectory: join(harness.root, 'run'), checkpointSummary: { checkpointCount: 1, bestValidationEsr: 0.012345 }, userMessages: []
    }
    vi.spyOn(manager, 'getCurrentJob').mockReturnValue(runtime)
    const destination = join(harness.root, 'my-custom-name')
    harness.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination })
    const exportModel = vi.spyOn(manager, 'exportTrainingModel').mockResolvedValue(`${destination}.nam`)

    expect(await invoke('jobs:exportModel', frozenJob.id, finish)).toBe(`${destination}.nam`)
    expect(harness.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: join(harness.root, 'run', 'My Amp - Original Studio - ESR 0.0123 - Snapshot 2026-09-19 14-32-08.nam'),
      properties: ['showOverwriteConfirmation']
    }))
    expect(exportModel).toHaveBeenCalledWith(frozenJob.id, `${destination}.nam`, finish)

    harness.showSaveDialog.mockResolvedValue({ canceled: true })
    exportModel.mockClear()
    expect(await invoke('jobs:exportModel', frozenJob.id, finish)).toBeNull()
    expect(exportModel).not.toHaveBeenCalled()
  })
})

describe('manual report save dialog', () => {
  it.each(['png', 'html'])('validates a finished run and saves only the selected %s format', async (format) => {
    const { getQueueManager } = await import('../jobs/queueManager')
    const manager = getQueueManager()
    const frozenJob = normalizeJobSpec({ ...draftInput('Old stopped run'), id: 'report-run' })
    const runtime: JobRuntimeState = { jobId: frozenJob.id, jobName: frozenJob.name, status: 'canceled', pid: null,
      frozenJob, userMessages: [], outputRootDir: harness.root }
    vi.spyOn(manager, 'getQueue').mockReturnValue([runtime])
    const save = vi.spyOn(manager, 'saveReport').mockResolvedValue({ paths: ['saved'], warnings: [] })
    harness.showSaveDialog.mockResolvedValueOnce({ canceled: true })
    expect(await invoke('jobs:saveReport', runtime.jobId, format)).toBeNull()
    expect(save).not.toHaveBeenCalled()
    harness.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(harness.root, 'Chosen report') })
    expect(await invoke('jobs:saveReport', runtime.jobId, format)).toEqual({ paths: ['saved'], warnings: [] })
    expect(save).toHaveBeenCalledWith(runtime.jobId, format, join(harness.root, `Chosen report.${format}`))
    expect(frozenJob).toMatchObject({ saveTrainingImage: false, saveTrainingHtml: false })
    await expect(invoke('jobs:saveReport', runtime.jobId, 'pdf')).rejects.toThrow('Invalid training report request')
    runtime.status = 'running'
    await expect(invoke('jobs:saveReport', runtime.jobId, format)).rejects.toThrow('finished runs')
  })
})
