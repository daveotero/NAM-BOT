import type { JobRuntimeState } from './training'

export interface TrainingRecord {
  jobId: string
  modelName?: string
  status: 'succeeded' | 'failed' | 'canceled'
  finishedAt: string
  durationMs: number | null
  epochs: number | null
  presetId: string | null
  presetName: string
}

export interface TrainingStatistics {
  schemaVersion: 1
  trackingStartedAt: string
  runs: TrainingRecord[]
}

export function createTrainingRecord(runtime: JobRuntimeState): TrainingRecord | null {
  if (!['succeeded', 'failed', 'canceled'].includes(runtime.status) || !runtime.finishedAt
    || !Number.isFinite(Date.parse(runtime.finishedAt))) return null
  if (runtime.status !== 'succeeded' && runtime.status !== 'failed' && runtime.status !== 'canceled') return null

  const elapsed = Date.parse(runtime.finishedAt) - Date.parse(runtime.startedAt ?? '')
  const timingUncertain = runtime.errorCategory === 'process_state_lost' || runtime.errorCategory === 'force_stop_failed'
  // Checkpoints and ESR measurements refer to completed epochs. A progress
  // counter can describe an unfinished epoch, so do not count it on failed runs.
  const epochs = [
    ...(runtime.esrHistory ?? []).map(entry => entry.epoch),
    typeof runtime.checkpointSummary?.latestCheckpointEpoch === 'number' ? runtime.checkpointSummary.latestCheckpointEpoch + 1 : 0,
    runtime.status === 'succeeded' ? runtime.currentEpoch ?? 0 : 0
  ].filter(value => Number.isInteger(value) && value > 0)
  return {
    jobId: runtime.jobId,
    modelName: runtime.frozenJob.metadata.name?.trim() || runtime.jobName || runtime.frozenJob.name,
    status: runtime.status,
    finishedAt: runtime.finishedAt,
    durationMs: !timingUncertain && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null,
    epochs: epochs.length ? Math.max(...epochs) : null,
    presetId: runtime.frozenPreset?.id ?? runtime.frozenJob.presetId,
    presetName: runtime.frozenPreset?.name ?? 'Unknown preset'
  }
}

export interface TrainingTotals {
  completed: number
  durationMs: number
  epochs: number
  mostUsedPreset: { name: string; count: number } | null
}

export function summarizeTraining(statistics: TrainingStatistics): TrainingTotals {
  const presets = new Map<string, { name: string; count: number }>()
  let completed = 0
  let durationMs = 0
  let epochs = 0
  for (const run of statistics.runs) {
    durationMs += run.durationMs ?? 0
    epochs += run.epochs ?? 0
    if (run.status !== 'succeeded') continue
    completed += 1
    if (!run.presetId || run.presetName === 'Unknown preset') continue
    const previous = presets.get(run.presetId)
    presets.set(run.presetId, { name: run.presetName, count: (previous?.count ?? 0) + 1 })
  }
  const mostUsedPreset = [...presets.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null
  return { completed, durationMs, epochs, mostUsedPreset }
}
