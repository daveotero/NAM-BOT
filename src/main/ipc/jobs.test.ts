import { mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultJobSpec, normalizeJobSpec, type JobSpec } from '../../shared/training'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const harness = vi.hoisted(() => ({
  root: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-job-ipc-${Date.now()}-${Math.random()}`,
  handlers: new Map<string, Handler>(),
  failDraftWrites: false
}))

vi.mock('electron', () => ({
  app: { getPath: () => harness.root, getVersion: () => '0.6.5' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (name: string, handler: Handler) => harness.handlers.set(name, handler) },
  dialog: {}, shell: {}
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
  await startIpc()
})
afterEach(() => rmSync(harness.root, { recursive: true, force: true }))

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
