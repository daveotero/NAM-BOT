import type { TrainingReportFormat, TrainingReportResult } from '../shared/training-report'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { AppCommand, AppDialogRequest, AppMenuAnchor, ShellWindowState } from '../shared/appShell'
import type { LogChunk } from '../shared/logs'
import type { UpdateStatus } from '../shared/update'
import type { QueueControlState } from '../shared/training'
import type { TrainingStatistics } from '../shared/training-statistics'
import type { AppSettings } from '../main/types'
import { stripIpcErrorPrefix } from '../shared/ipc-errors'

/** ipcRenderer.invoke, with main-process errors reduced to the message their handler threw. */
function invoke<TResult>(channel: string, ...args: unknown[]): Promise<TResult> {
  return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    throw error instanceof Error ? new Error(stripIpcErrorPrefix(error.message)) : error
  })
}

export interface NamBotApi {
  platform: string
  shell: {
    setDialogsReady: (ready: boolean) => Promise<void>
    respondToDialog: (id: string, response: number) => Promise<void>
    onDialogRequested: (callback: (request: AppDialogRequest) => void) => () => void
    getWindowState: () => Promise<ShellWindowState>
    openMenu: (anchor: AppMenuAnchor) => Promise<void>
    onWindowState: (callback: (state: ShellWindowState) => void) => () => void
    onMenuRequested: (callback: () => void) => () => void
  }
  settings: {
    get: () => Promise<unknown>
    save: (settings: unknown) => Promise<AppSettings>
    validate: () => Promise<unknown>
    detectConda: () => Promise<unknown>
    getAcceleratorDiagnostics: () => Promise<unknown>
    getTrainingLaunchDiagnostics: () => Promise<unknown>
    getNamVersionInfo: () => Promise<unknown>
    chooseCondaPath: () => Promise<string | null>
    chooseDirectory: () => Promise<string | null>
  }
  jobs: {
    getTrainingStatistics: () => Promise<TrainingStatistics>
    dismissRecentRun: (jobId: string) => Promise<TrainingStatistics>
    dismissAllRecentRuns: () => Promise<TrainingStatistics>
    getControlState: () => Promise<QueueControlState>
    resumeQueue: (terminationConfirmed?: boolean) => Promise<void>
    createDraft: (input?: unknown) => Promise<unknown>
    createDraftBatch: (input: unknown) => Promise<unknown[]>
    saveDraft: (job: unknown) => Promise<unknown>
    deleteDraft: (jobId: string) => Promise<void>
    listDrafts: () => Promise<unknown[]>
    reorderDrafts: (jobIds: string[]) => Promise<void>
    enqueue: (jobId: string) => Promise<void>
    enqueueMany: (jobIds: string[]) => Promise<void>
    reorder: (jobIds: string[]) => Promise<void>
    unqueue: (jobId: string) => Promise<unknown>
    unqueueAll: () => Promise<unknown[]>
    cancel: (jobId: string) => Promise<void>
    forceStop: (jobId: string) => Promise<void>
    saveReport: (jobId: string, format: TrainingReportFormat) => Promise<TrainingReportResult | null>
    exportModel: (jobId: string, finishAfterExport?: boolean) => Promise<string | null>
    retry: (jobId: string) => Promise<unknown>
    clearFinished: () => Promise<void>
    clearItem: (jobId: string) => Promise<void>
    tagBatchSource: (jobId: string, batchId: string, batchSourceName: string) => Promise<unknown>
    duplicate: (jobId: string) => Promise<unknown>
    listQueue: () => Promise<unknown[]>
    getRuntime: (jobId: string) => Promise<unknown | null>
    openResultFolder: (jobId: string) => Promise<void>
    openArtifact: (jobId: string, target: string) => Promise<void>
    chooseAudioFile: () => Promise<string | null>
    getDefaultInputAudioPath: () => Promise<string | null>
    saveDefaultAudioTo: () => Promise<string | null>
    getPathForFile: (file: File) => string
  }
  presets: {
    getWarnings: () => Promise<string[]>
    list: () => Promise<unknown[]>
    save: (preset: unknown) => Promise<unknown>
    delete: (presetId: string) => Promise<void>
    exportPreset: (preset: unknown) => Promise<string | null>
    importPreset: () => Promise<unknown | null>
  }
  logs: {
    getTerminal: (jobId: string) => Promise<string>
    getTerminalChunk: (jobId: string, offset: number | null) => Promise<LogChunk>
    getDiagnostics: () => Promise<string>
  }
  updates: {
    getStatus: () => Promise<UpdateStatus>
    openLatestRelease: () => Promise<void>
    openLatestChangelog: () => Promise<void>
  }
  events: {
    onQueueControlUpdated: (callback: (state: QueueControlState) => void) => () => void
    onQueueUpdated: (callback: (queue: unknown[]) => void) => () => void
    onJobUpdated: (callback: (state: unknown) => void) => () => void
    onBackendValidationUpdated: (callback: (summary: unknown) => void) => () => void
    onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void
    onAppCommand: (callback: (command: AppCommand) => void) => () => void
  }
}

const api: NamBotApi = {
  platform: process.platform,
  shell: {
    setDialogsReady: (ready) => invoke('shell:dialogsReady', ready),
    respondToDialog: (id, response) => invoke('shell:respondToDialog', id, response),
    onDialogRequested: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, request: AppDialogRequest): void => callback(request)
      ipcRenderer.on('shell:dialogRequested', handler)
      return () => ipcRenderer.removeListener('shell:dialogRequested', handler)
    },
    getWindowState: () => invoke('shell:getWindowState'),
    openMenu: (anchor) => invoke('shell:openMenu', anchor),
    onWindowState: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: ShellWindowState): void => callback(state)
      ipcRenderer.on('shell:windowState', handler)
      return () => ipcRenderer.removeListener('shell:windowState', handler)
    },
    onMenuRequested: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on('shell:menuRequested', handler)
      return () => ipcRenderer.removeListener('shell:menuRequested', handler)
    }
  },
  settings: {
    get: () => invoke('settings:get'),
    save: (settings) => invoke('settings:save', settings),
    validate: () => invoke('settings:validate'),
    detectConda: () => invoke('settings:detectConda'),
    getAcceleratorDiagnostics: () => invoke('settings:getAcceleratorDiagnostics'),
    getTrainingLaunchDiagnostics: () => invoke('settings:getTrainingLaunchDiagnostics'),
    getNamVersionInfo: () => invoke('settings:getNamVersionInfo'),
    chooseCondaPath: () => invoke('settings:chooseCondaPath'),
    chooseDirectory: () => invoke('settings:chooseDirectory')
  },
  jobs: {
    getTrainingStatistics: () => invoke('jobs:getTrainingStatistics'),
    dismissRecentRun: (jobId: string) => invoke('jobs:dismissRecentRun', jobId),
    dismissAllRecentRuns: () => invoke('jobs:dismissAllRecentRuns'),
    getControlState: () => invoke('jobs:getControlState'),
    resumeQueue: (terminationConfirmed) => invoke('jobs:resumeQueue', terminationConfirmed),
    createDraft: (input) => invoke('jobs:createDraft', input),
    createDraftBatch: (input) => invoke('jobs:createDraftBatch', input),
    saveDraft: (job) => invoke('jobs:saveDraft', job),
    deleteDraft: (jobId) => invoke('jobs:deleteDraft', jobId),
    listDrafts: () => invoke('jobs:listDrafts'),
    reorderDrafts: (jobIds) => invoke('jobs:reorderDrafts', jobIds),
    enqueue: (jobId) => invoke('jobs:enqueue', jobId),
    enqueueMany: (jobIds) => invoke('jobs:enqueueMany', jobIds),
    reorder: (jobIds) => invoke('jobs:reorder', jobIds),
    unqueue: (jobId) => invoke('jobs:unqueue', jobId),
    unqueueAll: () => invoke('jobs:unqueueAll'),
    cancel: (jobId) => invoke('jobs:cancel', jobId),
    forceStop: (jobId) => invoke('jobs:forceStop', jobId),
    saveReport: (jobId, format) => invoke('jobs:saveReport', jobId, format),
    exportModel: (jobId, finishAfterExport = false) => invoke('jobs:exportModel', jobId, finishAfterExport),
    retry: (jobId) => invoke('jobs:retry', jobId),
    clearFinished: () => invoke('jobs:clearFinished'),
    clearItem: (jobId) => invoke('jobs:clearItem', jobId),
    tagBatchSource: (jobId, batchId, batchSourceName) => invoke('jobs:tagBatchSource', jobId, batchId, batchSourceName),
    duplicate: (jobId) => invoke('jobs:duplicate', jobId),
    listQueue: () => invoke('jobs:listQueue'),
    getRuntime: (jobId) => invoke('jobs:getRuntime', jobId),
    openResultFolder: (jobId) => invoke('jobs:openResultFolder', jobId),
    openArtifact: (jobId, target) => invoke('jobs:openArtifact', jobId, target),
    chooseAudioFile: () => invoke('jobs:chooseAudioFile'),
    getDefaultInputAudioPath: () => invoke('jobs:getDefaultInputAudioPath'),
    saveDefaultAudioTo: () => invoke('jobs:saveDefaultAudioTo'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  presets: {
    getWarnings: () => invoke('presets:getWarnings'),
    list: () => invoke('presets:list'),
    save: (preset) => invoke('presets:save', preset),
    delete: (presetId) => invoke('presets:delete', presetId),
    exportPreset: (preset) => invoke('presets:export', preset),
    importPreset: () => invoke('presets:import')
  },
  logs: {
    getTerminal: (jobId) => invoke('logs:getTerminal', jobId),
    getTerminalChunk: (jobId, offset) => invoke('logs:getTerminalChunk', jobId, offset),
    getDiagnostics: () => invoke('logs:getDiagnostics')
  },
  updates: {
    getStatus: () => invoke('updates:getStatus'),
    openLatestRelease: () => invoke('updates:openLatestRelease'),
    openLatestChangelog: () => invoke('updates:openLatestChangelog')
  },
  events: {
    onQueueControlUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: QueueControlState): void => callback(state)
      ipcRenderer.on('queue:controlUpdated', handler)
      return () => ipcRenderer.removeListener('queue:controlUpdated', handler)
    },
    onQueueUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, queue: unknown[]) => callback(queue)
      ipcRenderer.on('queue:updated', handler)
      return () => ipcRenderer.removeListener('queue:updated', handler)
    },
    onJobUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
      ipcRenderer.on('job:updated', handler)
      return () => ipcRenderer.removeListener('job:updated', handler)
    },
    onBackendValidationUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, summary: unknown) => callback(summary)
      ipcRenderer.on('backend:validationUpdated', handler)
      return () => ipcRenderer.removeListener('backend:validationUpdated', handler)
    },
    onUpdateStatusChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
      ipcRenderer.on('updates:statusChanged', handler)
      return () => ipcRenderer.removeListener('updates:statusChanged', handler)
    },
    onAppCommand: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) => callback(command)
      ipcRenderer.on('app:command', handler)
      void invoke('app:commandsReady', true).catch((error: unknown) => console.error('Could not initialize application commands:', error))
      return () => {
        ipcRenderer.removeListener('app:command', handler)
        void invoke('app:commandsReady', false).catch((error: unknown) => console.error('Could not detach application commands:', error))
      }
    }
  }
}

contextBridge.exposeInMainWorld('namBot', api)

type RendererErrorPayload = {
  message: string
  stack?: string
  source?: string
  fileName?: string
  line?: number
  column?: number
  isUnhandledRejection?: boolean
}

const reportRendererError = (payload: RendererErrorPayload) => {
  ipcRenderer.send('renderer:error', payload)
}

window.addEventListener('error', (event) => {
  reportRendererError({
    message: event.message ?? 'Unknown renderer error',
    stack: event.error?.stack,
    source: event.filename,
    fileName: event.filename,
    line: event.lineno,
    column: event.colno,
    isUnhandledRejection: false
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection')
  const stack = reason instanceof Error ? reason.stack : undefined
  reportRendererError({
    message,
    stack,
    isUnhandledRejection: true
  })
})
