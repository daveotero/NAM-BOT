import { existsSync, readFileSync, renameSync } from 'fs'
import { extname } from 'path'
import log from 'electron-log/main'

import type { JobRuntimeState } from '../../shared/training'
import { createTrainingRecord, type TrainingRecord, type TrainingStatistics } from '../../shared/training-statistics'
import { atomicWriteJsonSync } from './atomicFile'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalCount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function isTrainingRecord(value: unknown): value is TrainingRecord {
  return isRecord(value) && typeof value.jobId === 'string'
    && (value.modelName === undefined || typeof value.modelName === 'string')
    && (value.status === 'succeeded' || value.status === 'failed' || value.status === 'canceled')
    && typeof value.finishedAt === 'string' && Number.isFinite(Date.parse(value.finishedAt))
    && isOptionalCount(value.durationMs) && isOptionalCount(value.epochs)
    && (value.presetId === null || typeof value.presetId === 'string') && typeof value.presetName === 'string'
}

/** The ledger stored at path, or null when it cannot be parsed or has a format this version cannot read. */
function readLedger(path: string): TrainingStatistics | null {
  let stored: unknown
  try {
    stored = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (error) {
    log.warn('Could not parse training statistics file:', path, error)
    return null
  }
  if (!isRecord(stored) || stored.schemaVersion !== 1 || typeof stored.trackingStartedAt !== 'string'
    || !Array.isArray(stored.runs) || !stored.runs.every(isTrainingRecord)
    || (stored.dismissedRecentRunIds !== undefined && (!Array.isArray(stored.dismissedRecentRunIds)
      || !stored.dismissedRecentRunIds.every(id => typeof id === 'string')))) {
    log.warn('Training statistics file has an unsupported format:', path)
    return null
  }
  return { schemaVersion: 1, trackingStartedAt: stored.trackingStartedAt, runs: stored.runs,
    dismissedRecentRunIds: Array.isArray(stored.dismissedRecentRunIds) ? stored.dismissedRecentRunIds : [] }
}

export class TrainingStatisticsStore {
  private data: TrainingStatistics | null = null
  /** Session-only notice; never written to the ledger. */
  private setAsideFile: string | null = null

  constructor(private readonly path: string) {}

  get(): TrainingStatistics {
    const statistics = this.load()
    return this.setAsideFile ? { ...statistics, setAsideFile: this.setAsideFile } : statistics
  }

  private load(): TrainingStatistics {
    this.data ??= this.readOrRecover()
    return structuredClone(this.data)
  }

  private readOrRecover(): TrainingStatistics {
    const backupPath = `${this.path}.bak`
    const hasPrimary = existsSync(this.path)
    const hasBackup = existsSync(backupPath)
    if (!hasPrimary && !hasBackup) {
      return { schemaVersion: 1, trackingStartedAt: new Date().toISOString(), runs: [] }
    }

    const primary = hasPrimary ? readLedger(this.path) : null
    if (primary) return primary

    const unreadablePath = this.getUnreadablePath()
    const backup = hasBackup ? readLedger(backupPath) : null
    if (backup) {
      // The backup is at most one save behind. Moving the unreadable primary aside lets the
      // next save write a new primary without first copying the bad file over this backup.
      if (hasPrimary) {
        try {
          renameSync(this.path, unreadablePath)
        } catch (error) {
          log.error('Could not set aside the unreadable training statistics file:', error)
        }
      }
      log.warn('Training statistics restored from backup:', backupPath)
      return backup
    }

    // Neither copy is readable: damaged, or written by a newer NAM-BOT. Keep both for support
    // and start a new ledger, so Jobs can still be cleared and new runs are still counted.
    try {
      if (hasPrimary) renameSync(this.path, unreadablePath)
      if (hasBackup) renameSync(backupPath, `${unreadablePath}.bak`)
    } catch (error) {
      log.error('Could not set aside unreadable training statistics:', error)
      throw new Error('Training statistics could not be read. The existing file has been preserved.')
    }
    this.setAsideFile = hasPrimary ? unreadablePath : `${unreadablePath}.bak`
    log.warn('Unreadable training statistics set aside; starting a new ledger:', this.setAsideFile)
    return { schemaVersion: 1, trackingStartedAt: new Date().toISOString(), runs: [] }
  }

  private getUnreadablePath(): string {
    const extension = extname(this.path)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `${this.path.slice(0, this.path.length - extension.length)}.unreadable-${stamp}${extension}`
  }

  dismissRecentRun(jobId: string): TrainingStatistics {
    const previous = this.load()
    if (!previous.runs.some(run => run.jobId === jobId && run.status === 'succeeded')) {
      throw new Error('This completed run is no longer available.')
    }
    const dismissed = previous.dismissedRecentRunIds ?? []
    if (dismissed.includes(jobId)) return this.get()
    const next = { ...previous, dismissedRecentRunIds: [...dismissed, jobId] }
    atomicWriteJsonSync(this.path, next)
    this.data = next
    return this.get()
  }

  dismissAllRecentRuns(): TrainingStatistics {
    const previous = this.load()
    const dismissed = new Set(previous.dismissedRecentRunIds ?? [])
    for (const run of previous.runs) {
      if (run.status === 'succeeded') dismissed.add(run.jobId)
    }
    const next = { ...previous, dismissedRecentRunIds: [...dismissed] }
    atomicWriteJsonSync(this.path, next)
    this.data = next
    return this.get()
  }

  record(queue: JobRuntimeState[]): void {
    const previous = this.load()
    const records = new Map(previous.runs.map(run => [run.jobId, run]))
    let changed = false
    for (const runtime of queue) {
      const record = createTrainingRecord(runtime)
      if (!record || JSON.stringify(records.get(record.jobId)) === JSON.stringify(record)) continue
      records.set(record.jobId, record)
      changed = true
    }
    if (!changed && existsSync(this.path)) return
    const next: TrainingStatistics = { ...previous, runs: [...records.values()] }
    // Only update memory after the atomic write succeeds; clearing history must
    // never remove the last copy of a run whose statistics have not been saved.
    atomicWriteJsonSync(this.path, next)
    this.data = next
  }
}
