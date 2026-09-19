import { existsSync } from 'fs'

import type { JobRuntimeState } from '../../shared/training'
import { createTrainingRecord, type TrainingRecord, type TrainingStatistics } from '../../shared/training-statistics'
import { atomicWriteJsonSync, readJsonWithBackupSync } from './atomicFile'

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

export class TrainingStatisticsStore {
  private data: TrainingStatistics | null = null

  constructor(private readonly path: string) {}

  get(): TrainingStatistics {
    if (!this.data) {
      if (existsSync(this.path) || existsSync(`${this.path}.bak`)) {
        const stored = readJsonWithBackupSync(this.path)
        if (!isRecord(stored) || stored.schemaVersion !== 1 || typeof stored.trackingStartedAt !== 'string'
          || !Array.isArray(stored.runs) || !stored.runs.every(isTrainingRecord)) {
          throw new Error('Training statistics could not be read. The existing file has been preserved.')
        }
        this.data = { schemaVersion: 1, trackingStartedAt: stored.trackingStartedAt, runs: stored.runs }
      } else {
        this.data = { schemaVersion: 1, trackingStartedAt: new Date().toISOString(), runs: [] }
      }
    }
    return structuredClone(this.data)
  }

  record(queue: JobRuntimeState[]): void {
    const previous = this.get()
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
