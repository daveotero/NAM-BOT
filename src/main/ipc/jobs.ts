import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import log from 'electron-log/main'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getQueueManager } from '../jobs/queueManager'
import { loadSettings } from '../persistence/settingsStore'
import { JobRuntimeState, JobSpec, defaultJobSpec, normalizeJobSpec } from '../types/jobs'

const draftsPath = join(app.getPath('userData'), 'drafts.json')
const drafts: Map<string, JobSpec> = new Map()

function cloneJobSpec(job: JobSpec): JobSpec {
  return JSON.parse(JSON.stringify(job)) as JobSpec
}

function saveDrafts(): void {
  writeFileSync(draftsPath, JSON.stringify(Array.from(drafts.values()), null, 2), 'utf-8')
}

function loadDrafts(): void {
  if (!existsSync(draftsPath)) {
    return
  }

  try {
    const parsed = JSON.parse(readFileSync(draftsPath, 'utf-8')) as unknown
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

function createDraftFromInput(input?: Partial<JobSpec>): JobSpec {
  const now = new Date().toISOString()
  const normalized = normalizeJobSpec(input)
  return {
    ...JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>,
    ...normalized,
    id: input?.id ?? uuidv4(),
    name: normalized.name || 'New Job',
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  }
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

  queueManager.on('queueUpdated', (queue: JobRuntimeState[]) => {
    broadcastQueue(queue)
  })

  queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
    broadcastJob(runtime)
  })

  ipcMain.handle('jobs:createDraft', async (_event, input?: Partial<JobSpec>) => {
    const job = createDraftFromInput(input)
    drafts.set(job.id, job)
    saveDrafts()
    return job
  })

  ipcMain.handle('jobs:saveDraft', async (_event, job: JobSpec) => {
    const updated = {
      ...normalizeJobSpec(job),
      id: job.id,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    }
    drafts.set(updated.id, updated)
    saveDrafts()
    return updated
  })

  ipcMain.handle('jobs:deleteDraft', async (_event, jobId: string) => {
    drafts.delete(jobId)
    saveDrafts()
  })

  ipcMain.handle('jobs:listDrafts', async () => {
    return Array.from(drafts.values())
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
    queueManager.addToQueue(frozenSpec)
    drafts.delete(draftId)
    saveDrafts()
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:enqueueMany', async (_event, draftIds: string[]) => {
    let enqueuedCount = 0
    for (const draftId of draftIds) {
      const draft = drafts.get(draftId)
      if (!draft) {
        continue
      }
      const frozenSpec = cloneJobSpec(draft)
      const taskId = uuidv4()
      frozenSpec.id = taskId
      frozenSpec.updatedAt = new Date().toISOString()
      queueManager.addToQueue(frozenSpec)
      drafts.delete(draftId)
      enqueuedCount += 1
    }

    if (enqueuedCount === 0) {
      throw new Error('No valid jobs were provided to enqueueMany')
    }

    saveDrafts()
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:unqueue', async (_event, jobId: string) => {
    const restored = queueManager.unqueueJob(jobId)
    if (restored) {
      drafts.set(restored.id, restored)
      saveDrafts()
    }
    return restored
  })

  ipcMain.handle('jobs:unqueueAll', async () => {
    const restoredDrafts = queueManager.unqueueAll()
    for (const restored of restoredDrafts) {
      drafts.set(restored.id, restored)
    }
    saveDrafts()
    return restoredDrafts
  })

  ipcMain.handle('jobs:cancel', async (_event, jobId: string) => {
    await queueManager.cancelJob(jobId)
  })

  ipcMain.handle('jobs:forceStop', async (_event, jobId: string) => {
    await queueManager.forceStopJob(jobId)
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
    drafts.set(newJob.id, newJob)
    saveDrafts()
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
      shell.openPath(targetPath)
    }
  })

  ipcMain.handle('jobs:chooseAudioFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Audio File',
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'aiff', 'aif'] },
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
