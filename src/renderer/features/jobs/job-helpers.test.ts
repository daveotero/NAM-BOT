import { describe, expect, it } from 'vitest'

import { defaultJobSpec, type JobRuntimeState, type JobSpec } from '../../state/types'
import {
  formatPackedSubmodelMetricLabel,
  getBestEsrLabel,
  getCollapsedSummaryItems,
  getElapsedLabel,
  getStatusSentence,
  getPrimaryPackedSubmodel
} from './job-helpers'

const nowMs = Date.parse('2026-05-11T12:00:00.000Z')

function buildFrozenJob(): JobSpec {
  return {
    ...defaultJobSpec,
    id: 'job-elapsed-label',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z'
  }
}

function buildRuntime(overrides: Partial<JobRuntimeState> = {}): JobRuntimeState {
  const base: JobRuntimeState = {
    jobId: 'job-elapsed-label',
    jobName: 'Elapsed Label Job',
    status: 'running',
    pid: null,
    frozenJob: buildFrozenJob(),
    userMessages: []
  }

  return {
    ...base,
    ...overrides,
    terminalProgress: overrides.terminalProgress
      ? {
          ...base.terminalProgress,
          ...overrides.terminalProgress
        }
      : base.terminalProgress
  }
}

describe('getElapsedLabel', () => {
  it('formats elapsed runtime under one hour from startedAt', () => {
    const runtime = buildRuntime({
      startedAt: '2026-05-11T11:58:55.000Z'
    })

    expect(getElapsedLabel(runtime, nowMs)).toBe('1:05')
  })

  it('formats elapsed runtime over one hour from startedAt', () => {
    const runtime = buildRuntime({
      startedAt: '2026-05-11T10:58:55.000Z'
    })

    expect(getElapsedLabel(runtime, nowMs)).toBe('1:01:05')
  })

  it('clamps negative elapsed runtime to zero', () => {
    const runtime = buildRuntime({
      startedAt: '2026-05-11T12:00:05.000Z'
    })

    expect(getElapsedLabel(runtime, nowMs)).toBe('0:00')
  })

  it('uses terminal elapsed progress when startedAt is missing', () => {
    const runtime = buildRuntime({
      terminalProgress: {
        elapsed: '0:42'
      }
    })

    expect(getElapsedLabel(runtime, nowMs)).toBe('0:42')
  })

  it('uses terminal elapsed progress when startedAt is invalid', () => {
    const runtime = buildRuntime({
      startedAt: 'not-a-date',
      terminalProgress: {
        elapsed: '2:10'
      }
    })

    expect(getElapsedLabel(runtime, nowMs)).toBe('2:10')
  })

  it('returns null without startedAt or terminal elapsed progress', () => {
    expect(getElapsedLabel(buildRuntime(), nowMs)).toBeNull()
  })
})

describe('getCollapsedSummaryItems', () => {
  it('does not include unreliable remaining time estimates for running jobs', () => {
    const runtime = buildRuntime({
      startedAt: '2026-05-11T11:59:00.000Z',
      terminalProgress: {
        percent: 50,
        currentEpoch: 1,
        totalEpochs: 2
      }
    })

    const items = getCollapsedSummaryItems(runtime, 'A2 Packed WaveNet', nowMs)

    expect(items).toEqual([
      { label: 'Progress', value: '50%' },
      { label: 'Elapsed', value: '1:00' }
    ])
  })

  it('shows diagnostics-blocked queued jobs as blocked instead of ordinary waiting jobs', () => {
    const runtime = buildRuntime({
      status: 'queued',
      errorCategory: 'a2_diagnostics_pending',
      plannedEpochs: 100
    })

    expect(getStatusSentence(runtime)).toBe('Run Diagnostics to confirm NAM 0.13.0+ before this A2 job can start.')
    expect(getCollapsedSummaryItems(runtime, 'A2 Packed WaveNet', nowMs)).toEqual([
      { label: 'Blocked', value: 'Run Diagnostics', tone: 'error' },
      { label: 'Preset', value: 'A2 Packed WaveNet' },
      { label: 'Epochs', value: '100' }
    ])
  })
})

describe('checkpoint metric labels', () => {
  it('uses the highest-quality packed submodel as the primary ESR', () => {
    const runtime = buildRuntime({
      checkpointSummary: {
        checkpointCount: 3,
        bestValidationEsr: 0.0123,
        packedSubmodels: [
          {
            submodelIndex: 0,
            submodelName: 'channels_3',
            bestValidationEsr: 0.02
          },
          {
            submodelIndex: 1,
            submodelName: 'channels_8',
            bestValidationEsr: 0.0123
          }
        ]
      }
    })

    expect(getBestEsrLabel(runtime)).toBe('A2 Full ESR')
    expect(getPrimaryPackedSubmodel(runtime)?.submodelName).toBe('channels_8')
  })

  it('uses the heavy packed submodel as the primary ESR when available', () => {
    const runtime = buildRuntime({
      checkpointSummary: {
        checkpointCount: 4,
        bestValidationEsr: 0.0088,
        packedSubmodels: [
          {
            submodelIndex: 0,
            submodelName: 'channels_3',
            bestValidationEsr: 0.02
          },
          {
            submodelIndex: 1,
            submodelName: 'channels_8',
            bestValidationEsr: 0.0123
          },
          {
            submodelIndex: 2,
            submodelName: 'channels_12',
            bestValidationEsr: 0.0088
          }
        ]
      }
    })

    expect(getBestEsrLabel(runtime)).toBe('A2 Heavy ESR')
    expect(getPrimaryPackedSubmodel(runtime)?.submodelName).toBe('channels_12')
  })

  it('uses friendly ESR labels by packed A2 channel range', () => {
    const expectedLabels: Array<[number, string]> = [
      [3, 'A2 Lite ESR'],
      [4, 'A2 Full ESR'],
      [8, 'A2 Full ESR'],
      [9, 'A2 Heavy ESR'],
      [12, 'A2 Heavy ESR'],
      [13, 'A2 Ultra ESR'],
      [16, 'A2 Ultra ESR'],
      [17, 'A2 Mammoth ESR'],
      [20, 'A2 Mammoth ESR'],
      [21, 'A2 Colossal ESR'],
      [24, 'A2 Colossal ESR'],
      [25, 'A2 Leviathan ESR'],
      [28, 'A2 Leviathan ESR']
    ]

    for (const [channels, expectedLabel] of expectedLabels) {
      expect(formatPackedSubmodelMetricLabel({
        submodelIndex: channels,
        submodelName: `channels_${channels}`,
        bestValidationEsr: 0.014,
        epoch: 12,
        step: 100,
        checkpointPath: `packed_best_submodel_${channels}.ckpt`
      })).toBe(expectedLabel)
    }
  })
})
