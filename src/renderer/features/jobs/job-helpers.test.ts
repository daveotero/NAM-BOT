import { describe, expect, it } from 'vitest'

import { defaultJobSpec, type JobRuntimeState, type JobSpec } from '../../state/types'
import { formatPackedSubmodelMetricLabel, getBestEsrLabel, getElapsedLabel } from './job-helpers'

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

describe('checkpoint metric labels', () => {
  it('labels packed A2 checkpoint ESR as aggregate', () => {
    const runtime = buildRuntime({
      checkpointSummary: {
        checkpointCount: 3,
        bestValidationEsr: 0.0123,
        bestValidationEsrKind: 'aggregate'
      }
    })

    expect(getBestEsrLabel(runtime)).toBe('Best aggregate ESR')
  })

  it('uses friendly labels for official packed A2 submodels', () => {
    expect(formatPackedSubmodelMetricLabel({
      submodelIndex: 0,
      submodelName: 'channels_3',
      bestValidationMetric: 0.014,
      epoch: 12,
      step: 100,
      checkpointPath: 'packed_best_submodel_0.ckpt'
    })).toBe('A2 Lite ESR')

    expect(formatPackedSubmodelMetricLabel({
      submodelIndex: 1,
      submodelName: 'channels_8',
      bestValidationMetric: 0.009,
      epoch: 12,
      step: 100,
      checkpointPath: 'packed_best_submodel_1.ckpt'
    })).toBe('A2 Full ESR')
  })
})
