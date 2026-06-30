import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  A1_STANDARD_PRESET_ID,
  DEFAULT_PRESET_ID,
  createTrainingPreset,
  defaultJobSpec,
  getBuiltInPreset,
  type JobSpec
} from '../types/jobs'
import { buildJobConfigs, validateJobSpec } from './configBuilder'

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nam-bot-config-'))
  tempDirs.push(dir)
  return dir
}

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

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

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

describe('buildJobConfigs', () => {
  it('keeps the strict final 9 second validation split for default input audio', () => {
    const tempDir = createTempDir()
    const preset = getBuiltInPreset(DEFAULT_PRESET_ID)
    const paths = buildJobConfigs(buildJobSpec({ inputAudioIsDefault: true }), tempDir, preset)
    const dataConfig = JSON.parse(readFileSync(paths.dataConfig, 'utf-8')) as {
      train?: { start_seconds?: number | null; stop_seconds?: number | null }
      validation?: { start_seconds?: number | null; stop_seconds?: number | null }
      common?: { require_input_pre_silence?: unknown }
    }

    expect(dataConfig.train).toMatchObject({
      start_seconds: null,
      stop_seconds: -9.0
    })
    expect(dataConfig.validation).toMatchObject({
      start_seconds: -9.0,
      stop_seconds: null
    })
    expect(dataConfig.common).not.toHaveProperty('require_input_pre_silence')
  })

  it('uses a generic final 10 second validation split and bypasses pre-silence checks for custom input audio', () => {
    const tempDir = createTempDir()
    const preset = getBuiltInPreset(DEFAULT_PRESET_ID)
    const paths = buildJobConfigs(buildJobSpec({ inputAudioIsDefault: false }), tempDir, preset)
    const dataConfig = JSON.parse(readFileSync(paths.dataConfig, 'utf-8')) as {
      train?: { start_seconds?: number | null; stop_seconds?: number | null }
      validation?: { start_seconds?: number | null; stop_seconds?: number | null }
      common?: { require_input_pre_silence?: unknown }
    }

    expect(dataConfig.train).toMatchObject({
      start_seconds: null,
      stop_seconds: -10.0
    })
    expect(dataConfig.validation).toMatchObject({
      start_seconds: -10.0,
      stop_seconds: null
    })
    expect(dataConfig.common?.require_input_pre_silence).toBeNull()
  })

  it('generates A2 PackedWaveNet model and output normalization configs by default', () => {
    const tempDir = createTempDir()
    const preset = getBuiltInPreset(DEFAULT_PRESET_ID)
    const paths = buildJobConfigs(buildJobSpec(), tempDir, preset)
    const dataConfig = JSON.parse(readFileSync(paths.dataConfig, 'utf-8')) as {
      joint?: Array<{ name?: string; kwargs?: { level_rms_dbfs?: number } }>
    }
    const modelConfig = JSON.parse(readFileSync(paths.modelConfig, 'utf-8')) as {
      net?: { name?: string; config?: { submodels?: unknown[]; export?: { container_max_values?: string } } }
      loss?: { mrstft_weight?: number }
      optimizer?: { weight_decay?: number }
    }

    expect(modelConfig.net?.name).toBe('PackedWaveNet')
    expect(modelConfig.net?.config?.submodels).toHaveLength(2)
    expect(modelConfig.net?.config?.export?.container_max_values).toBe('uniform')
    expect(modelConfig.loss?.mrstft_weight).toBe(0.0005)
    expect(modelConfig.optimizer?.weight_decay).toBe(3.17e-7)
    expect(dataConfig.joint?.[0]).toEqual({
      name: 'nam.data.normalize_joint_dataset_output',
      kwargs: {
        level_rms_dbfs: -18
      }
    })
  })

  it('keeps A1 WaveNet configs on A1 presets', () => {
    const tempDir = createTempDir()
    const preset = getBuiltInPreset(A1_STANDARD_PRESET_ID)
    const paths = buildJobConfigs(buildJobSpec(), tempDir, preset)
    const dataConfig = JSON.parse(readFileSync(paths.dataConfig, 'utf-8')) as { joint?: unknown }
    const modelConfig = JSON.parse(readFileSync(paths.modelConfig, 'utf-8')) as {
      net?: { name?: string; config?: { layers_configs?: Array<Record<string, unknown>>; submodels?: unknown[] } }
      loss?: { pre_emph_mrstft_weight?: number; mrstft_weight?: number }
      optimizer?: { weight_decay?: number }
    }

    expect(modelConfig.net?.name).toBe('WaveNet')
    expect(modelConfig.net?.config?.submodels).toBeUndefined()
    expect(modelConfig.net?.config?.layers_configs?.[0].head).toEqual({
      out_channels: 8,
      kernel_size: 1,
      bias: false
    })
    expect(modelConfig.net?.config?.layers_configs?.[0].head_size).toBeUndefined()
    expect(modelConfig.net?.config?.layers_configs?.[0].head_bias).toBeUndefined()
    expect(modelConfig.loss?.pre_emph_mrstft_weight).toBe(0.0002)
    expect(modelConfig.loss?.mrstft_weight).toBeUndefined()
    expect(modelConfig.optimizer?.weight_decay).toBeUndefined()
    expect(dataConfig.joint).toBeUndefined()
  })

  it('replaces generated model.net when an expert net override is supplied', () => {
    const tempDir = createTempDir()
    const expertNet = {
      name: 'WaveNet',
      config: {
        layers_configs: [],
        head_scale: 0.42
      }
    }
    const preset = createTrainingPreset({
      id: 'expert-net-replacement',
      name: 'Expert Net Replacement',
      expert: {
        model: {
          net: expertNet
        }
      }
    })
    const paths = buildJobConfigs(buildJobSpec(), tempDir, preset)
    const modelConfig = JSON.parse(readFileSync(paths.modelConfig, 'utf-8')) as {
      net?: typeof expertNet
    }

    expect(modelConfig.net).toEqual(expertNet)
  })
})
