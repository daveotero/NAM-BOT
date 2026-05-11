import { describe, expect, it } from 'vitest'

import { defaultJobSpec, type JobSpec } from '../types/jobs'
import { validateJobSpec } from './configBuilder'

function buildJobSpec(overrides: Partial<JobSpec> = {}): JobSpec {
  const base: JobSpec = {
    ...defaultJobSpec,
    id: 'job-config-validation',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    inputAudioPath: 'C:\\captures\\input.wav',
    outputAudioPath: 'C:\\captures\\output.wav',
    outputRootDir: 'C:\\models',
    trainingOverrides: {
      ...defaultJobSpec.trainingOverrides
    }
  }

  return {
    ...base,
    ...overrides,
    trainingOverrides: {
      ...base.trainingOverrides,
      ...(overrides.trainingOverrides ?? {})
    }
  }
}

describe('validateJobSpec', () => {
  it('accepts a complete job spec', () => {
    expect(validateJobSpec(buildJobSpec())).toEqual({
      valid: true,
      errors: []
    })
  })

  it('reports missing required paths', () => {
    const result = validateJobSpec(buildJobSpec({
      inputAudioPath: '',
      outputAudioPath: '',
      outputRootDir: ''
    }))

    expect(result).toEqual({
      valid: false,
      errors: [
        'Input audio path is required',
        'Output audio path is required',
        'Output root directory is required'
      ]
    })
  })

  it('rejects epochs below one', () => {
    const result = validateJobSpec(buildJobSpec({
      trainingOverrides: {
        epochs: 0
      }
    }))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Epochs must be at least 1')
  })

  it('rejects non-finite latency values', () => {
    const result = validateJobSpec(buildJobSpec({
      trainingOverrides: {
        latencySamples: Number.NaN
      }
    }))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Latency must be a valid number')
  })

  it('accepts minimum epochs and zero latency', () => {
    expect(validateJobSpec(buildJobSpec({
      trainingOverrides: {
        epochs: 1,
        latencySamples: 0
      }
    }))).toEqual({
      valid: true,
      errors: []
    })
  })
})
