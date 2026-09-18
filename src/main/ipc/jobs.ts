import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, copyFileSync, readFileSync, statSync } from 'fs'
import log from 'electron-log/main'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { AUDIO_EXTENSIONS } from '../../shared/audio'
import type { QueueControlState } from '../../shared/training'
import { getQueueManager } from '../jobs/queueManager'
import { loadSettings } from '../persistence/settingsStore'
import { JobRuntimeState, JobSpec, defaultJobSpec, normalizeJobSpec } from '../types/jobs'
import {
  atomicWriteJsonSync,
  readJsonWithBackupSync,
  removeFileIfExistsSync
} from '../persistence/atomicFile'

const draftsPath = join(app.getPath('userData'), 'drafts.json')
const draftQueueTransactionPath = join(app.getPath('userData'), 'draft-queue-transaction.json')
const drafts: Map<string, JobSpec> = new Map()

interface DraftQueueTransaction {
  direction?: 'enqueue' | 'unqueue'
  draftIds: string[]
  queuedJobIds: string[]
  restoredDrafts?: JobSpec[]
}

interface DraftBatchSource {
  kind: 'draft' | 'runtime'
  id: string
}

interface DraftBatchRequest {
  batchId: string
  batchSourceName: string
  drafts: unknown[]
  source: DraftBatchSource | null
}

type JobArtifactTarget = 'workspace' | 'output' | 'workspace-log' | 'run-log' | 'model' | 'snapshot'

function isJobArtifactTarget(value: unknown): value is JobArtifactTarget {
  return value === 'workspace'
    || value === 'output'
    || value === 'workspace-log'
    || value === 'run-log'
    || value === 'model'
    || value === 'snapshot'
}

function getJobArtifactPath(job: JobRuntimeState, target: JobArtifactTarget): string | null {
  if (target === 'snapshot') return job.modelExports?.at(-1)?.path ?? null
  if (target === 'workspace') {
    return job.workspaceDirectory ?? null
  }
  if (target === 'output') {
    return job.resolvedRunDirectory ?? job.outputRootDir ?? null
  }
  if (target === 'workspace-log') {
    return job.terminalLogPath ?? null
  }
  if (target === 'run-log') {
    return job.publishedTerminalLogPath ?? null
  }
  return job.publishedModelPath ?? null
}

async function openJobArtifactPath(targetPath: string): Promise<void> {
  if (!existsSync(targetPath)) {
    log.warn('Job artifact path does not exist:', targetPath)
    throw new Error(`This artifact is no longer available: ${targetPath}`)
  }

  try {
    if (statSync(targetPath).isFile()) {
      shell.showItemInFolder(targetPath)
      return
    }
  } catch (error) {
    log.warn('Failed to inspect job artifact path:', targetPath, error)
  }

  const errorMessage = await shell.openPath(targetPath)
  if (errorMessage) {
    log.warn('Failed to open job artifact path:', targetPath, errorMessage)
    throw new Error(`Could not open the artifact: ${errorMessage}`)
  }
}

function cloneJobSpec(job: JobSpec): JobSpec {
  return JSON.parse(JSON.stringify(job)) as JobSpec
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function saveDraftCollection(collection: Map<string, JobSpec>): void {
  atomicWriteJsonSync(draftsPath, Array.from(collection.values()))
}

function saveDrafts(): void {
  saveDraftCollection(drafts)
}

function loadDrafts(): void {
  if (!existsSync(draftsPath) && !existsSync(`${draftsPath}.bak`)) {
    return
  }

  try {
    const parsed = readJsonWithBackupSync(draftsPath)
    if (!Array.isArray(parsed)) {
      return
    }
    drafts.clear()
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) {
        continue
      }
      const candidate = normalizeJobSpec(entry)
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        continue
      }
      drafts.set(candidate.id, candidate)
    }
  } catch (error) {
    log.error('Failed to load drafts:', error)
  }
}

function createDraftFromInput(input?: unknown): JobSpec {
  const now = new Date().toISOString()
  const normalized = normalizeJobSpec(input)
  const candidate = isRecord(input) ? input : {}
  return {
    ...JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>,
    ...normalized,
    id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : uuidv4(),
    name: normalized.name || 'New Job',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: now
  }
}

function parseDraftBatchRequest(input: unknown): DraftBatchRequest {
  if (!isRecord(input)
    || typeof input.batchId !== 'string'
    || input.batchId.trim().length === 0
    || typeof input.batchSourceName !== 'string'
    || !Array.isArray(input.drafts)
    || input.drafts.length === 0) {
    throw new Error('Invalid draft batch request.')
  }

  let source: DraftBatchSource | null = null
  if (isRecord(input.source)) {
    const kind = input.source.kind
    const id = input.source.id
    if ((kind === 'draft' || kind === 'runtime') && typeof id === 'string' && id.length > 0) {
      source = { kind, id }
    }
  }

  return {
    batchId: input.batchId,
    batchSourceName: input.batchSourceName.trim() || 'Batch Training',
    drafts: input.drafts,
    source
  }
}

function recoverDraftQueueTransaction(queueManager: ReturnType<typeof getQueueManager>): void {
  if (!existsSync(draftQueueTransactionPath)) {
    return
  }

  try {
    const parsed = readJsonWithBackupSync(draftQueueTransactionPath)
    if (!isRecord(parsed) || !Array.isArray(parsed.draftIds) || !Array.isArray(parsed.queuedJobIds)) {
      removeFileIfExistsSync(draftQueueTransactionPath)
      return
    }

    const draftIds = parsed.draftIds.filter((value): value is string => typeof value === 'string')
    const queuedJobIds = parsed.queuedJobIds.filter((value): value is string => typeof value === 'string')
    if (parsed.direction === 'unqueue' && Array.isArray(parsed.restoredDrafts)) {
      const nextDrafts = new Map(drafts)
      for (const entry of parsed.restoredDrafts) {
        const draft = normalizeJobSpec(entry)
        if (draft.id) nextDrafts.set(draft.id, draft)
      }
      saveDraftCollection(nextDrafts)
      replaceDrafts(nextDrafts)
      for (const jobId of queuedJobIds) queueManager.unqueueJob(jobId)
      finishDraftQueueTransaction()
      return
    }
    const durableQueueIds = new Set(queueManager.getQueue().map((runtime) => runtime.jobId))
    if (queuedJobIds.length > 0 && queuedJobIds.every((jobId) => durableQueueIds.has(jobId))) {
      for (const draftId of draftIds) {
        drafts.delete(draftId)
      }
      saveDrafts()
    }
    removeFileIfExistsSync(draftQueueTransactionPath)
  } catch (error) {
    log.error('Failed to recover draft-to-queue transaction:', error)
  }
}

function replaceDrafts(nextDrafts: Map<string, JobSpec>): void {
  drafts.clear()
  for (const [id, draft] of nextDrafts) drafts.set(id, draft)
}

function commitDrafts(nextDrafts: Map<string, JobSpec>): void {
  saveDraftCollection(nextDrafts)
  replaceDrafts(nextDrafts)
}

function beginDraftQueueTransaction(transaction: DraftQueueTransaction): void {
  if (existsSync(draftQueueTransactionPath)) {
    recoverDraftQueueTransaction(getQueueManager())
    if (existsSync(draftQueueTransactionPath)) {
      throw new Error('A previous queue transfer could not be recovered. Check that the app data folder is writable and retry.')
    }
  }
  atomicWriteJsonSync(draftQueueTransactionPath, transaction)
}

function finishDraftQueueTransaction(): void {
  removeFileIfExistsSync(draftQueueTransactionPath)
}

function broadcastQueue(queue: JobRuntimeState[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('queue:updated', queue)
  })
}

function broadcastJob(runtime: JobRuntimeState): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('job:updated', runtime)
  })
}

export function setupJobIpcHandlers(): void {
  log.info('Setting up job IPC handlers')
  loadDrafts()

  const queueManager = getQueueManager()
  queueManager.setSettings(loadSettings())
  recoverDraftQueueTransaction(queueManager)

  queueManager.on('queueUpdated', (queue: JobRuntimeState[]) => {
    broadcastQueue(queue)
  })

  queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
    broadcastJob(runtime)
  })
  queueManager.on('queueControlUpdated', (state: QueueControlState) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('queue:controlUpdated', state)
  })

  ipcMain.handle('jobs:getControlState', async () => queueManager.getControlState())
  ipcMain.handle('jobs:resumeQueue', async (_event, terminationConfirmed: boolean = false) => {
    await queueManager.resumeQueue(terminationConfirmed === true)
  })

  ipcMain.handle('jobs:createDraft', async (_event, input?: Partial<JobSpec>) => {
    const job = createDraftFromInput(input)
    commitDrafts(new Map(drafts).set(job.id, job))
    return job
  })

  ipcMain.handle('jobs:createDraftBatch', async (_event, input: unknown) => {
    const request = parseDraftBatchRequest(input)
    const existing = Array.from(drafts.values()).filter((draft) => draft.batchId === request.batchId
      && !(request.source?.kind === 'draft' && draft.id === request.source.id))
    if (existing.length > 0) {
      const existingPaths = new Set(existing.map((draft) => draft.outputAudioPath))
      const requestedPaths = new Set(request.drafts.map((draft) => normalizeJobSpec(draft).outputAudioPath))
      if (existingPaths.size !== requestedPaths.size
        || Array.from(requestedPaths).some((outputPath) => !existingPaths.has(outputPath))) {
        throw new Error(`Batch ${request.batchId} already exists with different output files.`)
      }
      return existing
    }

    const created = request.drafts.map((draftInput) => createDraftFromInput({
      ...normalizeJobSpec(draftInput),
      batchId: request.batchId,
      batchSourceName: request.batchSourceName
    }))
    const nextDrafts = new Map(drafts)
    for (const draft of created) {
      nextDrafts.set(draft.id, draft)
    }
    if (request.source?.kind === 'draft') {
      const sourceDraft = nextDrafts.get(request.source.id)
      if (sourceDraft) {
        nextDrafts.set(sourceDraft.id, {
          ...sourceDraft,
          batchId: request.batchId,
          batchSourceName: request.batchSourceName,
          updatedAt: new Date().toISOString()
        })
      }
    }

    saveDraftCollection(nextDrafts)
    drafts.clear()
    for (const [draftId, draft] of nextDrafts) {
      drafts.set(draftId, draft)
    }

    if (request.source?.kind === 'runtime') {
      try {
        queueManager.tagQueueItemBatch(
          request.source.id,
          request.batchId,
          request.batchSourceName
        )
      } catch (error) {
        log.error('Batch drafts were saved, but tagging the runtime source failed:', error)
      }
    }
    return created
  })

  ipcMain.handle('jobs:saveDraft', async (_event, job: JobSpec) => {
    const updated = {
      ...normalizeJobSpec(job),
      id: job.id,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    }
    commitDrafts(new Map(drafts).set(updated.id, updated))
    return updated
  })

  ipcMain.handle('jobs:deleteDraft', async (_event, jobId: string) => {
    const nextDrafts = new Map(drafts)
    nextDrafts.delete(jobId)
    commitDrafts(nextDrafts)
  })

  ipcMain.handle('jobs:listDrafts', async () => {
    return Array.from(drafts.values())
  })

  ipcMain.handle('jobs:reorderDrafts', async (_event, draftIds: string[]) => {
    const orderedDrafts: JobSpec[] = []
    for (const draftId of draftIds) {
      const draft = drafts.get(draftId)
      if (draft) {
        orderedDrafts.push(draft)
      }
    }

    for (const draft of drafts.values()) {
      if (!draftIds.includes(draft.id)) {
        orderedDrafts.push(draft)
      }
    }

    commitDrafts(new Map(orderedDrafts.map((draft) => [draft.id, draft])))
  })

  ipcMain.handle('jobs:enqueue', async (_event, draftId: string) => {
    const draft = drafts.get(draftId)
    if (!draft) {
      throw new Error(`Cannot enqueue unknown job: ${draftId}`)
    }

    const frozenSpec = cloneJobSpec(draft)
    const taskId = uuidv4()
    frozenSpec.id = taskId
    frozenSpec.updatedAt = new Date().toISOString()
    await queueManager.validateJobCanTrain(frozenSpec)
    beginDraftQueueTransaction({ draftIds: [draftId], queuedJobIds: [frozenSpec.id] })
    try {
      queueManager.addToQueue(frozenSpec)
    } catch (error) {
      finishDraftQueueTransaction()
      throw error
    }
    drafts.delete(draftId)
    try {
      saveDrafts()
      finishDraftQueueTransaction()
    } catch (error) {
      log.error('Queue item is durable; draft cleanup will be recovered on restart:', error)
    }
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:enqueueMany', async (_event, draftIds: string[]) => {
    const specsToEnqueue: Array<{ draftId: string; spec: JobSpec }> = []
    for (const draftId of draftIds) {
      const draft = drafts.get(draftId)
      if (!draft) {
        continue
      }
      const frozenSpec = cloneJobSpec(draft)
      const taskId = uuidv4()
      frozenSpec.id = taskId
      frozenSpec.updatedAt = new Date().toISOString()
      specsToEnqueue.push({ draftId, spec: frozenSpec })
    }

    if (specsToEnqueue.length === 0) {
      throw new Error('No valid jobs were provided to enqueueMany')
    }

    for (const entry of specsToEnqueue) {
      await queueManager.validateJobCanTrain(entry.spec)
    }

    beginDraftQueueTransaction({
      draftIds: specsToEnqueue.map((entry) => entry.draftId),
      queuedJobIds: specsToEnqueue.map((entry) => entry.spec.id)
    })
    try {
      queueManager.addManyToQueue(specsToEnqueue.map((entry) => entry.spec))
    } catch (error) {
      finishDraftQueueTransaction()
      throw error
    }
    for (const entry of specsToEnqueue) {
      drafts.delete(entry.draftId)
    }
    try {
      saveDrafts()
      finishDraftQueueTransaction()
    } catch (error) {
      log.error('Queued jobs are durable; draft cleanup will be recovered on restart:', error)
    }
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:unqueue', async (_event, jobId: string) => {
    const runtime = queueManager.getQueue().find((entry) => entry.jobId === jobId
      && (entry.status === 'queued' || entry.status === 'validating'))
    if (!runtime) return null
    const restored = cloneJobSpec(runtime.frozenJob)
    beginDraftQueueTransaction({ direction: 'unqueue', draftIds: [restored.id], queuedJobIds: [jobId], restoredDrafts: [restored] })
    const nextDrafts = new Map(drafts).set(restored.id, restored)
    saveDraftCollection(nextDrafts)
    replaceDrafts(nextDrafts)
    queueManager.unqueueJob(jobId)
    finishDraftQueueTransaction()
    return restored
  })

  ipcMain.handle('jobs:unqueueAll', async () => {
    const waiting = queueManager.getQueue().filter((entry) => entry.status === 'queued' || entry.status === 'validating')
    const restoredDrafts = waiting.map((entry) => cloneJobSpec(entry.frozenJob))
    if (restoredDrafts.length === 0) return []
    beginDraftQueueTransaction({ direction: 'unqueue', draftIds: restoredDrafts.map((entry) => entry.id), queuedJobIds: waiting.map((entry) => entry.jobId), restoredDrafts })
    const nextDrafts = new Map(drafts)
    for (const restored of restoredDrafts) nextDrafts.set(restored.id, restored)
    saveDraftCollection(nextDrafts)
    replaceDrafts(nextDrafts)
    queueManager.unqueueAll()
    finishDraftQueueTransaction()
    return restoredDrafts
  })

  ipcMain.handle('jobs:cancel', async (_event, jobId: string) => {
    await queueManager.cancelJob(jobId)
  })

  ipcMain.handle('jobs:forceStop', async (_event, jobId: string) => {
    await queueManager.forceStopJob(jobId)
  })

  ipcMain.handle('jobs:exportModel', async (event, jobId: unknown, finishAfterExport: unknown = false) => {
    if (typeof jobId !== 'string' || typeof finishAfterExport !== 'boolean') throw new Error('Invalid model export request.')
    try {
      const runtime = queueManager.getCurrentJob()
      if (!runtime || runtime.jobId !== jobId || runtime.status !== 'running') throw new Error('This job is no longer training.')
      const name = runtime.jobName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Model'
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const options = {
        title: finishAfterExport ? 'Save best model and finish training' : 'Save snapshot and keep training',
        defaultPath: join(runtime.resolvedRunDirectory ?? runtime.outputRootDir ?? app.getPath('documents'), `${name} - snapshot ${stamp}.nam`),
        filters: [{ name: 'Neural Amp Modeler', extensions: ['nam'] }]
      }
      const owner = BrowserWindow.fromWebContents(event.sender)
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      const destination = result.filePath.toLowerCase().endsWith('.nam') ? result.filePath : `${result.filePath}.nam`
      return await queueManager.exportTrainingModel(jobId, destination, finishAfterExport)
    } catch (error) {
      log.error('Failed to export training model:', error)
      throw error
    }
  })

  ipcMain.handle('jobs:retry', async (_event, jobId: string) => {
    const runtime = queueManager.retryJob(jobId)
    if (runtime) {
      void queueManager.startQueue()
    }
    return runtime
  })

  ipcMain.handle('jobs:clearFinished', async () => {
    queueManager.clearFinished()
  })

  ipcMain.handle('jobs:clearItem', async (_event, jobId: string) => {
    queueManager.removeQueueItem(jobId)
  })

  ipcMain.handle('jobs:tagBatchSource', async (_event, jobId: string, batchId: string, batchSourceName: string) => {
    return queueManager.tagQueueItemBatch(jobId, batchId, batchSourceName)
  })

  ipcMain.handle('jobs:duplicate', async (_event, jobId: string) => {
    const job = drafts.get(jobId)
    if (!job) {
      return null
    }
    const newJob = {
      ...cloneJobSpec(job),
      id: uuidv4(),
      name: `${job.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    commitDrafts(new Map(drafts).set(newJob.id, newJob))
    return newJob
  })
  ipcMain.handle('jobs:reorder', async (_event, jobIds: string[]) => {
    queueManager.reorderQueue(jobIds)
  })

  ipcMain.handle('jobs:listQueue', async () => {
    return queueManager.getQueue()
  })

  ipcMain.handle('jobs:getRuntime', async (_event, jobId: string) => {
    return queueManager.getQueue().find((job) => job.jobId === jobId) || null
  })

  ipcMain.handle('jobs:openResultFolder', async (_event, jobId: string) => {
    const job = queueManager.getQueue().find((entry) => entry.jobId === jobId)
    const targetPath = job?.resolvedRunDirectory || job?.outputRootDir || job?.workspaceDirectory
    if (targetPath) {
      await openJobArtifactPath(targetPath)
    } else {
      throw new Error('This job does not have a results folder yet.')
    }
  })

  ipcMain.handle('jobs:openArtifact', async (_event, jobId: string, target: unknown) => {
    if (!isJobArtifactTarget(target)) {
      return
    }

    const job = queueManager.getQueue().find((entry) => entry.jobId === jobId)
    if (!job) {
      return
    }

    const targetPath = getJobArtifactPath(job, target)
    if (targetPath) {
      await openJobArtifactPath(targetPath)
    }
  })

  ipcMain.handle('jobs:chooseAudioFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Audio File',
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files', extensions: AUDIO_EXTENSIONS },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('jobs:getDefaultInputAudioPath', async () => {
    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'v3_0_0.wav')
      : join(app.getAppPath(), 'resources', 'v3_0_0.wav')
    if (existsSync(resourcesPath)) {
      return resourcesPath
    }
    log.warn('Default input audio not found at:', resourcesPath)
    return null
  })

  ipcMain.handle('jobs:saveDefaultAudioTo', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save Default Training Signal',
      defaultPath: 'v3_0_0.wav',
      filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
    })
    if (result.canceled || !result.filePath) return null
    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'v3_0_0.wav')
      : join(app.getAppPath(), 'resources', 'v3_0_0.wav')
    copyFileSync(resourcesPath, result.filePath)
    log.info('Default audio saved to:', result.filePath)
    return result.filePath
  })

  log.info('Job IPC handlers registered')
}
