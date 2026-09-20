import { describe, expect, it } from 'vitest'
import { createTrainingPreset, defaultJobSpec, normalizeJobSpec, type JobRuntimeState } from './training'
import { buildTrainingReportData, type TrainingExportEvidence } from './training-report'
import { CONVERGENCE_LEVELS, type ConvergenceStatus } from './convergence'

function runtime(): JobRuntimeState {
  return {
    jobId: 'report', jobName: 'Studio amp', status: 'succeeded', pid: null,
    frozenJob: { ...structuredClone(defaultJobSpec), id: 'report', name: 'Studio amp', createdAt: '', updatedAt: '',
      inputAudioPath: 'C:\\private\\input.wav', uiNotes: 'PRIVATE SESSION', metadata: { name: 'My amp', modeledBy: 'Dave' } },
    frozenPreset: createTrainingPreset({ name: 'Frozen recipe', expert: { data: { private: 'PRIVATE CONFIG' } } }),
    startedAt: '2026-09-19T10:00:00Z', finishedAt: '2026-09-19T10:10:00Z', currentEpoch: 3, plannedEpochs: 100,
    checkpointSummary: { checkpointCount: 3, packedSubmodels: [
      { submodelIndex: 0, submodelName: 'channels_3', bestValidationEsr: 0.02, epoch: 0 },
      { submodelIndex: 1, submodelName: 'channels_8', bestValidationEsr: 0.001, epoch: 1 }
    ] },
    esrHistory: [1, 2, 3].map(epoch => ({ epoch, step: epoch * 10, models: [{ submodelIndex: 0, esr: 0.1 / epoch }] })),
    terminalLogPath: 'C:\\private\\log.txt', userMessages: ['PRIVATE LOG']
  }
}

describe('training report snapshots', () => {
  it('exports per-model best values, one-based epochs and a detached allowlist', () => {
    const current = runtime()
    const report = buildTrainingReportData(current, { appVersion: 'test', modelPath: 'C:\\private\\Studio amp.nam' })
    expect(report.metrics.map(metric => [metric.esr, metric.epoch])).toEqual([[0.02, 1], [0.001, 2]])
    expect(report.modelFilename).toBe('Studio amp.nam')
    expect(report.facts).toContainEqual({ label: 'Duration', value: '0h 10m 0s' })
    current.esrHistory![0].models[0].esr = 999
    expect(report.history[0].models[0].esr).toBe(0.1)
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|private|terminalLogPath|checkpointPath/)
  })

  it('uses export-time checkpoint evidence even after training improves', () => {
    const current = runtime()
    const evidence: TrainingExportEvidence = {
      capturedAt: '2026-09-19T10:02:00Z', history: current.esrHistory!.slice(0, 1),
      metrics: [{ submodelIndex: 0, submodelName: 'channels_3', esr: 0.1, epoch: 1 }]
    }
    const report = buildTrainingReportData(current, { appVersion: 'test', modelPath: '/exports/snapshot.nam', evidence, snapshot: true })
    expect(report.metrics[0].esr).toBe(0.1)
    expect(report.history).toHaveLength(1)
    expect(report.finishedAt).toBeNull()
    expect(report.status).toBe('Training snapshot')
    expect(report.facts).toContainEqual({ label: 'Duration', value: '0h 2m 0s' })
    evidence.metrics.length = 0
    expect(report.metrics).toHaveLength(1)
  })

  it('does not invent metrics/history for old snapshots and marks missing models', () => {
    const report = buildTrainingReportData(runtime(), { appVersion: 'test', modelPath: null, snapshot: true })
    expect(report.savedModel).toBe(false)
    expect(report.history).toEqual([])
    expect(report.metrics.every(metric => metric.esr === null && metric.epoch === null)).toBe(true)
  })

  it('keeps snapshot stopping policy separate from later live changes and completion', () => {
    const current = runtime()
    const convergence: ConvergenceStatus = {
      version: 1, policy: { mode: 'fixed', level: 'balanced', maxEpochs: null }, originalEpochLimit: 100,
      epoch: 3, validatedEpochs: 3, phase: 'unavailable', achievedLevel: null, completionReason: null, message: 'Cannot write C:/PRIVATE_CAPTURE_FOLDER/status.json', changes: [],
      levels: CONVERGENCE_LEVELS.map(level => ({ level, confirmations: 0, qualified: false, firstReachedEpoch: null, waitingModels: [] }))
    }
    const evidence: TrainingExportEvidence = { capturedAt: '2026-09-19T10:02:00Z', history: current.esrHistory!, metrics: [], convergence }
    current.convergence = { ...structuredClone(convergence), policy: { mode: 'convergence', level: 'fast', maxEpochs: null }, completionReason: 'convergence' }
    const report = buildTrainingReportData(current, { appVersion: 'test', modelPath: '/exports/snapshot.nam', evidence, snapshot: true })
    convergence.policy.level = 'thorough'
    expect(report.convergence?.policy).toEqual({ mode: 'fixed', level: 'balanced', maxEpochs: null })
    expect(report.facts).toContainEqual({ label: 'Training mode', value: 'Fixed epochs' })
    expect(report.convergence?.completionReason).toBeNull()
    expect(JSON.stringify(report)).not.toContain('PRIVATE_CAPTURE_FOLDER')
    expect(buildTrainingReportData(current, { appVersion: 'test', modelPath: '/exports/model.nam' }).status).toBe('Auto-stopped · Fast')
  })

  it('normalizes independent report options without opting legacy jobs in', () => {
    expect(normalizeJobSpec({})).toMatchObject({ saveTrainingImage: false, saveTrainingHtml: false })
    expect(normalizeJobSpec({ saveTrainingImage: true, saveTrainingHtml: 'true' })).toMatchObject({ saveTrainingImage: true, saveTrainingHtml: false })
    expect(normalizeJobSpec({ saveTrainingImage: false, saveTrainingHtml: true })).toMatchObject({ saveTrainingImage: false, saveTrainingHtml: true })
  })

  it('does not undercount successful epochs when validation is less frequent', () => {
    const current = runtime()
    current.currentEpoch = 10
    const report = buildTrainingReportData(current, { appVersion: 'test', modelPath: '/exports/model.nam' })
    expect(report.facts).toContainEqual({ label: 'Epochs · completed / planned', value: '10 / 100' })
  })
})
