import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../../main/types'
import { getStoredStoppingPreference, getStoredConvergenceMaxEpochs, persistStoppingPreference, LAST_TRAINING_MODE_KEY, LAST_CONVERGENCE_MAX_EPOCHS_KEY } from './training-mode-preferences'

import {
  A1_STANDARD_PRESET_ID,
  DEFAULT_PRESET_ID,
  defaultJobSpec,
  createTrainingPreset
} from '../../state/types'
import {
  LAST_SAVE_TRAINING_IMAGE_STORAGE_KEY,
  LAST_SAVE_TRAINING_HTML_STORAGE_KEY,
  LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
  LAST_LATENCY_MODE_STORAGE_KEY,
  LAST_LATENCY_SAMPLES_STORAGE_KEY,
  LAST_USED_PRESET_STORAGE_KEY,
  applyStoredReusableDefaults,
  buildJobEditorSession,
  serializeJobEditorSession,
  persistReusableJobDefaults,
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
  it('starts with Balanced auto convergence unless a preset or saved user choice overrides it', () => {
    stubLocalStorage()
    const preset = createTrainingPreset()
    const options = { settings: null, presets: [preset] }
    expect(createNewJobDraft(options)).toMatchObject({
      stopping: { mode: 'convergence', level: 'balanced', maxEpochs: 2000 }, stoppingSource: 'defaults'
    })
    persistStoppingPreference({ mode: 'fixed', level: 'fast', maxEpochs: null })
    expect(createNewJobDraft(options).stopping?.mode).toBe('fixed')
    preset.stopping = { mode: 'convergence', level: 'thorough', maxEpochs: 3200 }
    const fromPreset = createNewJobDraft(options)
    expect(fromPreset.stopping).toEqual(preset.stopping)
    expect(fromPreset.stopping).not.toBe(preset.stopping)
    persistReusableJobDefaults(fromPreset, 'default')
    expect(getStoredStoppingPreference().mode).toBe('fixed')
    const custom = { ...fromPreset, stoppingSource: 'override' as const,
      stopping: { mode: 'convergence', level: 'fast', maxEpochs: 2300 } as const }
    persistReusableJobDefaults(custom, 'default')
    expect(getStoredStoppingPreference()).toEqual(custom.stopping)
    expect(applyStoredReusableDefaults(defaultJobSpec, null, preset).stopping).toEqual(preset.stopping)
  })
  it('defaults the safety limit to 2000 and remembers a custom value through fixed mode and reloads', () => {
    const storage = stubLocalStorage()
    expect(getStoredConvergenceMaxEpochs()).toBe(2000)
    persistStoppingPreference({ mode: 'convergence', level: 'fast', maxEpochs: 3500 })
    persistStoppingPreference({ mode: 'fixed', level: 'fast', maxEpochs: null })
    stubLocalStorage(Object.fromEntries(storage))
    expect(getStoredStoppingPreference().mode).toBe('fixed')
    expect(getStoredConvergenceMaxEpochs()).toBe(3500)
    stubLocalStorage({ [LAST_TRAINING_MODE_KEY]: JSON.stringify({ mode: 'convergence', level: 'balanced', maxEpochs: 2800 }) })
    expect(getStoredConvergenceMaxEpochs()).toBe(2800)
    stubLocalStorage({ [LAST_TRAINING_MODE_KEY]: JSON.stringify({ mode: 'convergence', level: 'balanced', maxEpochs: null }),
      [LAST_CONVERGENCE_MAX_EPOCHS_KEY]: '-1' })
    expect(getStoredStoppingPreference().maxEpochs).toBe(2000)
  })
  it('remembers the last selected training mode and level for the next new job', () => {
    stubLocalStorage()
    const preset = createTrainingPreset({ values: { epochs: 37 } })
    const stopping = { mode: 'convergence', level: 'thorough', maxEpochs: 2000 } as const
    persistStoppingPreference(stopping)
    expect(createNewJobDraft({ settings: defaultSettings, presets: [preset] }).stopping).toEqual(stopping)
    persistStoppingPreference({ mode: 'fixed', level: 'thorough', maxEpochs: null })
    const next = createNewJobDraft({ settings: defaultSettings, presets: [preset] })
    expect(next.stopping?.mode).toBe('fixed')
    expect(next.trainingOverrides.epochs).toBe(37)
    stubLocalStorage({ [LAST_TRAINING_MODE_KEY]: '{invalid' })
    expect(getStoredStoppingPreference()).toEqual({ mode: 'convergence', level: 'balanced', maxEpochs: 2000 })
  })
  it('uses the saved default preset and its epochs ahead of the built-in and last-used presets', () => {
    stubLocalStorage({ [LAST_USED_PRESET_STORAGE_KEY]: A1_STANDARD_PRESET_ID })
    const preferred = createTrainingPreset({ id: 'studio-preset', name: 'Studio preset', values: { epochs: 37 } })
    const draft = createNewJobDraft({
      settings: { ...defaultSettings, defaultPresetId: preferred.id },
      presets: [
        createTrainingPreset({ id: DEFAULT_PRESET_ID }),
        createTrainingPreset({ id: A1_STANDARD_PRESET_ID }),
        preferred
      ]
    })

    expect(draft.presetId).toBe(preferred.id)
    expect(draft.trainingOverrides.epochs).toBe(37)
  })

  it.each(['missing', 'hidden'])('falls back to the app default when the saved preset is %s', (availability: string) => {
    stubLocalStorage()
    const standard = createTrainingPreset({ id: DEFAULT_PRESET_ID, values: { epochs: 100 } })
    const draft = createNewJobDraft({
      settings: { ...defaultSettings, defaultPresetId: 'studio-preset' },
      presets: [standard, ...(availability === 'hidden' ? [createTrainingPreset({ id: 'studio-preset', visible: false, values: { epochs: 37 } })] : [])]
    })

    expect(draft.presetId).toBe(DEFAULT_PRESET_ID)
    expect(draft.trainingOverrides.epochs).toBe(100)
  })

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

describe('job editor change tracking', () => {
  it('ignores asynchronously resolved default paths while preserving typed entries', () => {
    stubLocalStorage()
    const session = buildJobEditorSession('New Job', createNewJobDraft({ settings: null, presets: [] }), null)
    const hydrated = { ...session, job: { ...session.job, inputAudioPath: 'C:/bundled/input.wav', outputRootDir: 'C:/derived' } }
    expect(serializeJobEditorSession(hydrated)).toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...hydrated, job: { ...hydrated.job, name: 'My amp' } })).not.toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...hydrated, job: { ...hydrated.job, outputAudioPath: 'C:/capture.wav' } })).not.toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...hydrated, job: { ...hydrated.job, metadata: { ...hydrated.job.metadata, modeledBy: 'Dave' } } })).not.toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...hydrated, job: { ...hydrated.job, trainingOverrides: { ...hydrated.job.trainingOverrides, epochs: (hydrated.job.trainingOverrides.epochs ?? 0) + 1 } } })).not.toBe(session.initialSnapshot)
  })

  it('tracks modes and custom paths, and becomes clean when an edit is reverted', () => {
    stubLocalStorage()
    const session = buildJobEditorSession('New Job', createNewJobDraft({ settings: null, presets: [] }), null)
    const changed = { ...session, job: { ...session.job, name: 'Changed' } }
    expect(serializeJobEditorSession(changed)).not.toBe(session.initialSnapshot)
    changed.job.name = session.job.name
    expect(serializeJobEditorSession(changed)).toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...session, inputMode: 'custom' })).not.toBe(session.initialSnapshot)
    expect(serializeJobEditorSession({ ...session, outputRootMode: 'custom' })).not.toBe(session.initialSnapshot)
    const custom = { ...session, inputMode: 'custom' as const, outputRootMode: 'custom' as const }
    expect(serializeJobEditorSession({ ...custom, job: { ...custom.job, inputAudioPath: 'C:/custom.wav' } })).not.toBe(serializeJobEditorSession(custom))
    expect(serializeJobEditorSession({ ...custom, job: { ...custom.job, outputRootDir: 'C:/models' } })).not.toBe(serializeJobEditorSession(custom))
  })
})

it('seeds report options independently from last-used choices', () => {
  const storage = stubLocalStorage({ [LAST_SAVE_TRAINING_IMAGE_STORAGE_KEY]: 'true' })
  const first = createNewJobDraft({ settings: null, presets: [] })
  expect(first).toMatchObject({ saveTrainingImage: true, saveTrainingHtml: false })
  storage.set(LAST_SAVE_TRAINING_IMAGE_STORAGE_KEY, 'false')
  storage.set(LAST_SAVE_TRAINING_HTML_STORAGE_KEY, 'true')
  expect(createNewJobDraft({ settings: null, presets: [] })).toMatchObject({ saveTrainingImage: false, saveTrainingHtml: true })
  expect(first).toMatchObject({ saveTrainingImage: true, saveTrainingHtml: false })
})
