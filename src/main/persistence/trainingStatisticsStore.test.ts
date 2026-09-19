import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { createTrainingPreset, defaultJobSpec, type JobRuntimeState } from '../../shared/training'
import { summarizeTraining } from '../../shared/training-statistics'
import { TrainingStatisticsStore } from './trainingStatisticsStore'

const directories: string[] = []
function createPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'nam-bot-statistics-'))
  directories.push(directory)
  return join(directory, 'training-statistics.json')
}
function run(overrides: Partial<JobRuntimeState> = {}): JobRuntimeState {
  return {
    jobId: 'finished-run', jobName: 'Capture', status: 'succeeded', pid: null,
    frozenJob: { ...defaultJobSpec, id: 'finished-run', name: 'Capture', createdAt: '', updatedAt: '' },
    frozenPreset: createTrainingPreset({ id: 'custom', name: 'Original preset' }),
    startedAt: '2026-09-18T10:00:00Z', finishedAt: '2026-09-18T11:00:00Z',
    currentEpoch: 20, plannedEpochs: 100, userMessages: [], ...overrides
  }
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('lifetime training statistics', () => {
  it('imports retained runs once, survives cleared history and restart, and counts retries separately', () => {
    const path = createPath()
    const store = new TrainingStatisticsStore(path)
    store.record([run()])
    store.record([run()])
    store.record([])
    const restarted = new TrainingStatisticsStore(path)
    expect(restarted.get().runs[0].modelName).toBe('Capture')
    expect(summarizeTraining(restarted.get())).toEqual({ completed: 1, durationMs: 3_600_000, epochs: 20, mostUsedPreset: { name: 'Original preset', count: 1 } })
    restarted.record([run({ jobId: 'retry-run' })])
    expect(summarizeTraining(restarted.get()).completed).toBe(2)
    expect(restarted.get().runs).toHaveLength(2)
  })

  it('records actual early-finish epochs, failed time, and excludes unknown interruption time', () => {
    const store = new TrainingStatisticsStore(createPath())
    store.record([
      run({ finishedEarly: true }),
      run({ jobId: 'failed', status: 'failed', currentEpoch: 5, checkpointSummary: { checkpointCount: 1, latestCheckpointEpoch: 3 } }),
      run({ jobId: 'interrupted', status: 'failed', errorCategory: 'process_state_lost', finishedAt: '2026-09-20T10:00:00Z' }),
      run({ jobId: 'canceled-before-start', status: 'canceled', startedAt: undefined, currentEpoch: undefined }),
      run({ jobId: 'still-running', status: 'running', finishedAt: undefined })
    ])
    const totals = summarizeTraining(store.get())
    expect(totals).toEqual({ completed: 1, durationMs: 7_200_000, epochs: 24, mostUsedPreset: { name: 'Original preset', count: 1 } })
    expect(store.get().runs).toHaveLength(4)
  })

  it('updates an existing finished record without duplicating it and retains frozen preset names', () => {
    const store = new TrainingStatisticsStore(createPath())
    store.record([run({ currentEpoch: 10 })])
    store.record([run({ currentEpoch: 12 })])
    expect(store.get().runs).toHaveLength(1)
    expect(summarizeTraining(store.get()).epochs).toBe(12)
    expect(summarizeTraining(store.get()).mostUsedPreset?.name).toBe('Original preset')
  })

  it('does not invent time or preset attribution for legacy records', () => {
    const store = new TrainingStatisticsStore(createPath())
    store.record([run({ startedAt: undefined, frozenPreset: undefined, currentEpoch: undefined })])
    expect(summarizeTraining(store.get())).toEqual({ completed: 1, durationMs: 0, epochs: 0, mostUsedPreset: null })
  })

  it('reads older ledgers without names and backfills names only from retained runs', () => {
    const path = createPath()
    const store = new TrainingStatisticsStore(path)
    store.record([run(), run({ jobId: 'already-cleared' })])
    const previous = store.get()
    for (const entry of previous.runs) delete entry.modelName
    writeFileSync(path, JSON.stringify(previous))

    const restarted = new TrainingStatisticsStore(path)
    expect(summarizeTraining(restarted.get()).completed).toBe(2)
    const retained = run()
    retained.frozenJob.metadata = { ...retained.frozenJob.metadata, name: 'Named model' }
    restarted.record([retained])
    restarted.record([])
    const saved = new TrainingStatisticsStore(path).get()
    expect(saved.runs.find(entry => entry.jobId === 'finished-run')?.modelName).toBe('Named model')
    expect(saved.runs.find(entry => entry.jobId === 'already-cleared')?.modelName).toBeUndefined()
    expect(summarizeTraining(saved).completed).toBe(2)
  })

  it('recovers a damaged primary from its atomic backup', () => {
    const path = createPath()
    const store = new TrainingStatisticsStore(path)
    store.record([run()])
    store.record([run({ jobId: 'second' })])
    writeFileSync(path, 'broken json')
    const recovered = new TrainingStatisticsStore(path)
    recovered.record([run({ jobId: 'second' })])
    expect(summarizeTraining(recovered.get()).completed).toBe(2)
  })

  it('preserves an unreadable ledger instead of replacing lifetime history with zeros', () => {
    const path = createPath()
    writeFileSync(path, '{"schemaVersion":99}')
    const store = new TrainingStatisticsStore(path)
    expect(() => store.record([run()])).toThrow('preserved')
    expect(readFileSync(path, 'utf-8')).toBe('{"schemaVersion":99}')
  })
})
