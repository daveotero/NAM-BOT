import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  A1_STANDARD_PRESET_ID,
  DEFAULT_PRESET_ID,
  defaultJobSpec,
  createTrainingPreset
} from '../../state/types'
import {
  LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
  LAST_LATENCY_MODE_STORAGE_KEY,
  LAST_LATENCY_SAMPLES_STORAGE_KEY,
  LAST_USED_PRESET_STORAGE_KEY,
  applyStoredReusableDefaults,
  createNewJobDraft
} from './jobEditorSession'

function stubLocalStorage(initialValues: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initialValues))

  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  })

  return values
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createNewJobDraft', () => {
  it('prefers the A2 default preset over a stored A1 last-used preset', () => {
    stubLocalStorage({
      [LAST_USED_PRESET_STORAGE_KEY]: A1_STANDARD_PRESET_ID
    })

    const draft = createNewJobDraft({
      settings: null,
      presets: [
        createTrainingPreset({
          id: A1_STANDARD_PRESET_ID,
          name: 'A1 Standard',
          visible: true,
          values: {
            architectureVersion: 'a1',
            modelFamily: 'WaveNet',
            architectureSize: 'standard',
            epochs: 100,
            batchSize: 16,
            learningRate: 0.004,
            learningRateDecay: 0.007,
            ny: 8192,
            fitMrstft: true,
            mrstftWeight: 0.0002,
            weightDecay: 0,
            outputNormalizeRmsDb: null
          }
        }),
        createTrainingPreset({
          id: DEFAULT_PRESET_ID,
          name: 'A2 Packed WaveNet',
          visible: true
        })
      ]
    })

    expect(draft.presetId).toBe(DEFAULT_PRESET_ID)
  })

  it('defaults new drafts to auto latency mode when no user preference is stored', () => {
    stubLocalStorage()

    const draft = createNewJobDraft({
      settings: null,
      presets: [createTrainingPreset({ id: DEFAULT_PRESET_ID, name: 'A2 Packed WaveNet', visible: true })]
    })

    expect(draft.trainingOverrides.latencyMode).toBe('auto')
    expect(draft.trainingOverrides.latencySamples).toBe(0)
  })

  it('applies the remembered final model copy preference to new drafts', () => {
    stubLocalStorage({
      [LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY]: 'true'
    })

    const draft = createNewJobDraft({
      settings: null,
      presets: [
        createTrainingPreset({
          id: DEFAULT_PRESET_ID,
          name: 'A2 Packed WaveNet',
          visible: true
        })
      ]
    })

    expect(draft.copyFinalModelToOutputAudioFolder).toBe(true)
  })
})

describe('applyStoredReusableDefaults', () => {
  it('reuses manual latency mode and samples after the user saves manual latency', () => {
    stubLocalStorage({
      [LAST_LATENCY_MODE_STORAGE_KEY]: 'manual',
      [LAST_LATENCY_SAMPLES_STORAGE_KEY]: '128'
    })

    const job = applyStoredReusableDefaults({ ...defaultJobSpec }, null)

    expect(job.trainingOverrides.latencyMode).toBe('manual')
    expect(job.trainingOverrides.latencySamples).toBe(128)
  })

  it('reuses auto latency mode without applying stale manual samples', () => {
    stubLocalStorage({
      [LAST_LATENCY_MODE_STORAGE_KEY]: 'auto',
      [LAST_LATENCY_SAMPLES_STORAGE_KEY]: '256'
    })

    const job = applyStoredReusableDefaults({ ...defaultJobSpec }, null)

    expect(job.trainingOverrides.latencyMode).toBe('auto')
    expect(job.trainingOverrides.latencySamples).toBe(0)
  })
})
