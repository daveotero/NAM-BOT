import { closeSync, existsSync, openSync, readSync, statSync } from 'fs'
import { StringDecoder } from 'string_decoder'
import type { JobEsrEpoch, JobEsrMeasurement } from '../../shared/training'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function normalizeEpoch(value: unknown): JobEsrEpoch | null {
  if (!isRecord(value) || !isNonnegativeInteger(value.epoch) || value.epoch < 1
    || !isNonnegativeInteger(value.step) || !Array.isArray(value.models)) return null

  const models: JobEsrMeasurement[] = []
  for (const model of value.models) {
    if (!isRecord(model)
      || (model.submodelIndex !== null && !isNonnegativeInteger(model.submodelIndex))
      || typeof model.esr !== 'number' || !Number.isFinite(model.esr) || model.esr < 0) continue
    if (models.some((entry) => entry.submodelIndex === model.submodelIndex)) continue
    models.push({
      submodelIndex: model.submodelIndex,
      submodelName: typeof model.submodelName === 'string' ? model.submodelName : null,
      esr: model.esr
    })
  }
  return models.length > 0 ? { epoch: value.epoch, step: value.step, models } : null
}

export function normalizeEsrHistory(value: unknown): JobEsrEpoch[] {
  if (!Array.isArray(value)) return []
  const epochs = new Map<number, JobEsrEpoch>()
  for (const entry of value) {
    const epoch = normalizeEpoch(entry)
    if (epoch && epoch.step >= (epochs.get(epoch.epoch)?.step ?? -1)) epochs.set(epoch.epoch, epoch)
  }
  return [...epochs.values()].sort((left, right) => left.epoch - right.epoch)
}

/** Tail complete JSONL records only; a partially written validation waits for the next poll. */
export class EsrHistoryReader {
  private offset = 0
  private pending = ''
  private decoder = new StringDecoder('utf8')

  constructor(private readonly filePath: string) {}

  read(): JobEsrEpoch[] {
    if (!existsSync(this.filePath)) return []
    const size = statSync(this.filePath).size
    if (size < this.offset) {
      this.offset = 0
      this.pending = ''
      this.decoder = new StringDecoder('utf8')
    }
    if (size === this.offset) return []
    const records: JobEsrEpoch[] = []
    const file = openSync(this.filePath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(size - this.offset, 64 * 1024))
      while (this.offset < size) {
        const count = readSync(file, buffer, 0, Math.min(buffer.length, size - this.offset), this.offset)
        if (count === 0) break
        this.offset += count
        this.pending += this.decoder.write(buffer.subarray(0, count))
        const lines = this.pending.split('\n')
        this.pending = lines.pop() ?? ''
        for (const line of lines) {
          try {
            const record = normalizeEpoch(JSON.parse(line))
            if (record) records.push(record)
          } catch {
            // Ignore an invalid record without losing the remaining training history.
          }
        }
      }
    } finally {
      closeSync(file)
    }
    return records
  }
}
