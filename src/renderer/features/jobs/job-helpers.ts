import {
  JobRuntimeState,
  JobStatus,
  JobStopMode
} from '../../state/types'

export type ActiveRuntimeStatus = 'preparing' | 'running' | 'stopping'
export const ACTIVE_RUNTIME_STATUSES: ActiveRuntimeStatus[] = ['preparing', 'running', 'stopping']
export const FORCE_STOP_DELAY_MS = 10_000

export type QueueDisplayState = 'Queued' | 'Running' | 'Successful' | 'Error'

export function filenameWithoutExt(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  const base = parts[parts.length - 1]
  return base.replace(/\.[^.]+$/, '')
}

export function getBasename(filePath: string): string {
  if (!filePath) return ''
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1]
}

export function getDirname(filePath: string): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) return ''
  if (lastSlash === 0) return '/'
  return normalized.substring(0, lastSlash)
}

export function isActiveRuntime(status: JobStatus): status is ActiveRuntimeStatus {
  return ACTIVE_RUNTIME_STATUSES.includes(status as ActiveRuntimeStatus)
}

export function isQueuedRuntime(runtime: JobRuntimeState): boolean {
  return runtime.status === 'queued' || runtime.status === 'validating'
}

export function isFinishedTraining(runtime: JobRuntimeState): boolean {
  return runtime.status === 'succeeded' || runtime.status === 'failed' || runtime.status === 'canceled'
}

export function formatEsr(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'Not yet available'
  return value < 0.001 ? value.toExponential(2) : value.toFixed(4)
}

export function cleanSingleLine(value: string | null | undefined): string {
  if (!value) return ''
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.replace(/\s+/g, ' ')
      ?? ''
  )
}

export function getLatestUserMessage(runtime: JobRuntimeState): string | null {
  for (let index = runtime.userMessages.length - 1; index >= 0; index -= 1) {
    const line = cleanSingleLine(runtime.userMessages[index])
    if (line) {
      return line
    }
  }
  return null
}

export function getLatestTerminalLine(runtime: JobRuntimeState): string | null {
  return cleanSingleLine(runtime.logSummary?.latestStructuredLine)
    || cleanSingleLine(runtime.logSummary?.latestTerminalLine)
    || null
}

export function getOutputPath(runtime: JobRuntimeState): string {
  return runtime.resolvedRunDirectory || runtime.outputRootDir || runtime.workspaceDirectory || ''
}

export function getDisplayState(runtime: JobRuntimeState): QueueDisplayState {
  switch (runtime.status) {
    case 'preparing':
    case 'running':
    case 'stopping':
      return 'Running'
    case 'succeeded':
      return 'Successful'
    case 'failed':
    case 'canceled':
      return 'Error'
    case 'queued':
    case 'validating':
    default:
      return 'Queued'
  }
}

export function getDetailedDeviceLabel(runtime: JobRuntimeState): string {
  const deviceSummary = runtime.deviceSummary
  if (!deviceSummary) return 'Checking Python environment'
  if (deviceSummary.acceleratorUsed === 'gpu' && deviceSummary.deviceName) {
    return `GPU: ${deviceSummary.deviceName}`
  }
  if (deviceSummary.acceleratorUsed === 'gpu') {
    return 'GPU in use'
  }
  if (deviceSummary.acceleratorRequested === 'gpu' && !deviceSummary.cudaAvailable) {
    return `CPU only (${deviceSummary.torchVersion || 'PyTorch runtime'})`
  }
  if (deviceSummary.acceleratorRequested === 'mps') {
    return 'Apple Silicon acceleration requested'
  }
  if (deviceSummary.torchVersion) {
    return `CPU (${deviceSummary.torchVersion})`
  }
  return 'CPU'
}

export function getProgressPercent(runtime: JobRuntimeState): number | null {
  const batchPercent = runtime.terminalProgress?.percent
  if (typeof batchPercent === 'number' && Number.isFinite(batchPercent)) {
    return Math.min(100, Math.max(0, batchPercent))
  }
  if (runtime.status === 'succeeded') {
    return 100
  }
  if (runtime.currentEpoch && runtime.plannedEpochs && runtime.plannedEpochs > 0) {
    return Math.min(100, Math.max(0, ((runtime.currentEpoch - 1) / runtime.plannedEpochs) * 100))
  }
  return null
}

export function getProgressHeadline(runtime: JobRuntimeState): string {
  if (runtime.status === 'stopping') {
    return runtime.stopMode === 'force' ? 'Force stopping...' : 'Stopping...'
  }

  const progress = runtime.terminalProgress
  if (progress?.currentEpoch && progress?.totalEpochs && progress.currentBatch && progress.totalBatches) {
    return `Epoch ${progress.currentEpoch} of ${progress.totalEpochs} - batch ${progress.currentBatch}/${progress.totalBatches}`
  }
  if (progress?.currentEpoch && progress?.totalEpochs) {
    return `Epoch ${progress.currentEpoch} of ${progress.totalEpochs}`
  }
  if (progress?.currentBatch && progress.totalBatches) {
    return `Batch ${progress.currentBatch}/${progress.totalBatches}`
  }
  if (runtime.currentEpoch && runtime.plannedEpochs) {
    return `Epoch ${runtime.currentEpoch} of ${runtime.plannedEpochs}`
  }
  return getLatestTerminalLine(runtime) || getLatestUserMessage(runtime) || 'Waiting for live terminal output'
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getElapsedRunSeconds(runtime: JobRuntimeState, nowMs: number): number | null {
  const startedAtMs = runtime.startedAt ? Date.parse(runtime.startedAt) : Number.NaN
  if (!Number.isFinite(startedAtMs)) {
    return null
  }

  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
}

function getRemainingRunSeconds(runtime: JobRuntimeState, nowMs: number): number | null {
  const elapsedSeconds = getElapsedRunSeconds(runtime, nowMs)
  const progressPercent = getProgressPercent(runtime)
  if (elapsedSeconds == null || progressPercent == null || progressPercent <= 0 || progressPercent >= 100) {
    return null
  }

  const progressFraction = progressPercent / 100
  const estimatedTotalSeconds = elapsedSeconds / progressFraction
  return Math.max(0, Math.round(estimatedTotalSeconds - elapsedSeconds))
}

export function getProgressMeta(runtime: JobRuntimeState, nowMs: number): string | null {
  const elapsedRunSeconds = getElapsedRunSeconds(runtime, nowMs)
  const remainingRunSeconds = getRemainingRunSeconds(runtime, nowMs)
  const parts = [
    elapsedRunSeconds != null
      ? `Elapsed ${formatDuration(elapsedRunSeconds)}`
      : runtime.terminalProgress?.elapsed
        ? `Elapsed ${runtime.terminalProgress.elapsed}`
        : null,
    remainingRunSeconds != null
      ? `Remaining ${formatDuration(remainingRunSeconds)}`
      : runtime.terminalProgress?.remaining
        ? `Remaining ${runtime.terminalProgress.remaining}`
        : null,
    runtime.terminalProgress?.rate || null
  ].filter((entry): entry is string => Boolean(entry))
  return parts.length > 0 ? parts.join(' - ') : null
}

export function getStatusSentence(runtime: JobRuntimeState): string {
  const displayState = getDisplayState(runtime)

  if (displayState === 'Queued') {
    return 'Waiting in queue'
  }

  if (displayState === 'Running') {
    return getProgressHeadline(runtime)
  }

  if (displayState === 'Successful') {
    return 'Training complete'
  }

  return getLatestUserMessage(runtime)
    || (runtime.exitCode != null ? `Training exited with code ${runtime.exitCode}.` : 'Training stopped with an error.')
}

export function getQueueSecondaryStat(runtime: JobRuntimeState, queue: JobRuntimeState[]): { label: string, value: string } {
  const queuedItems = queue.filter((entry) => isQueuedRuntime(entry))
  const position = queuedItems.findIndex((entry) => entry.jobId === runtime.jobId) + 1
  return {
    label: 'Queue position',
    value: position > 0 ? `${position} of ${queuedItems.length}` : 'Waiting'
  }
}

export function getTrainingSecondaryStat(runtime: JobRuntimeState): { label: string, value: string } {
  if (runtime.checkpointSummary?.bestValidationEsr != null) {
    return {
      label: 'Best ESR',
      value: formatEsr(runtime.checkpointSummary.bestValidationEsr)
    }
  }

  const percent = getProgressPercent(runtime)
  if (percent != null) {
    return {
      label: 'Progress',
      value: `${Math.round(percent)}%`
    }
  }

  if (runtime.exitCode != null) {
    return {
      label: 'Exit code',
      value: String(runtime.exitCode)
    }
  }

  return {
    label: 'Status',
    value: runtime.status === 'succeeded' ? 'Completed' : runtime.status === 'canceled' ? 'Stopped' : 'In progress'
  }
}

export interface StopActionState {
  label: string
  isForce: boolean
  disabled: boolean
}

export function getStopActionState(runtime: JobRuntimeState, nowMs: number): StopActionState | null {
  if (!isActiveRuntime(runtime.status)) {
    return null
  }

  if (runtime.status === 'stopping') {
    if (runtime.stopMode === 'force') {
      return {
        label: 'Force Stopping...',
        isForce: true,
        disabled: true
      }
    }

    const requestedAtMs = runtime.stopRequestedAt ? Date.parse(runtime.stopRequestedAt) : Number.NaN
    const canForceStop = Number.isFinite(requestedAtMs) && nowMs - requestedAtMs >= FORCE_STOP_DELAY_MS
    if (canForceStop) {
      return {
        label: 'Force Stop',
        isForce: true,
        disabled: false
      }
    }

    return {
      label: 'Stopping...',
      isForce: false,
      disabled: true
    }
  }

  return {
    label: 'Stop',
    isForce: false,
    disabled: false
  }
}

export interface QueueDetailItem {
  label: string
  value: string
  wide?: boolean
}

export function getExpandedDetails(runtime: JobRuntimeState): QueueDetailItem[] {
  const details: QueueDetailItem[] = [
    {
      label: 'Device',
      value: getDetailedDeviceLabel(runtime)
    },
    {
      label: 'Checkpoints',
      value: String(runtime.checkpointSummary?.checkpointCount ?? 0)
    },
    {
      label: 'Best ESR',
      value: formatEsr(runtime.checkpointSummary?.bestValidationEsr)
    },
    {
      label: 'Workspace log',
      value: runtime.terminalLogPath || 'Not yet available',
      wide: true
    },
    {
      label: 'Output folder',
      value: getOutputPath(runtime) || 'Waiting for output folder',
      wide: true
    }
  ]

  if (runtime.publishedTerminalLogPath) {
    details.push({
      label: 'Saved run log',
      value: runtime.publishedTerminalLogPath,
      wide: true
    })
  }

  if (runtime.publishedModelPath) {
    details.push({
      label: 'Model file',
      value: runtime.publishedModelPath,
      wide: true
    })
  }

  const latestTerminalLine = getLatestTerminalLine(runtime)
  if (latestTerminalLine) {
    details.push({
      label: 'Latest terminal line',
      value: latestTerminalLine,
      wide: true
    })
  }

  return details
}

