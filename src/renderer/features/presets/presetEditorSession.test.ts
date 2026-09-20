import { describe, expect, it } from 'vitest'
import { createImportedPreset, createTrainingPreset, normalizeTrainingPreset } from '../../../shared/training'
import { buildPresetEditorSession, mergeImportedTechnicalFields } from './presetEditorSession'

describe('preset stopping defaults', () => {
  it('keeps old presets unset and round-trips explicit policies through portable JSON', () => {
    expect(normalizeTrainingPreset({ name: 'Legacy' }).stopping).toBeUndefined()
    const preset = createTrainingPreset({ name: 'Auto', stopping: { mode: 'convergence', level: 'thorough', maxEpochs: 3200 } })
    const imported = createImportedPreset(JSON.stringify(preset)).preset
    expect(imported.stopping).toEqual(preset.stopping)
    const duplicate = createTrainingPreset({ ...preset, id: 'duplicate' })
    expect(duplicate.stopping).toEqual(preset.stopping)
    expect(duplicate.stopping).not.toBe(preset.stopping)
    expect(buildPresetEditorSession('Edit', imported).preset.stopping).toEqual(preset.stopping)
  })

  it('supplies a required safety limit and rejects invalid preset stopping rules', () => {
    expect(normalizeTrainingPreset({ stopping: { mode: 'convergence', level: 'balanced', maxEpochs: null } }).stopping?.maxEpochs).toBe(2000)
    for (const stopping of [
      { mode: 'convergence', level: 'unknown', maxEpochs: 2000 },
      { mode: 'convergence', level: 'balanced', maxEpochs: 0 },
      { mode: 'convergence', level: 'balanced', maxEpochs: 2.5 },
      { mode: 'fixed', level: 'balanced', maxEpochs: 2000 }
    ]) expect(() => normalizeTrainingPreset({ stopping })).toThrow('Invalid preset training mode')
  })

  it('preserves stopping rules when importing raw NAM config and applies explicit imported rules', () => {
    const base = createTrainingPreset({ id: 'existing', name: 'My recipe', author: { name: 'Studio' },
      stopping: { mode: 'convergence', level: 'fast', maxEpochs: 2500 } })
    const raw = createImportedPreset('{"learning":{"trainer":{"max_epochs":88}}}').preset
    const merged = mergeImportedTechnicalFields(base, raw)
    expect(merged.stopping).toEqual(base.stopping)
    expect(merged.expert.learning).toEqual({ trainer: { max_epochs: 88 } })
    const imported = createTrainingPreset({ name: 'Other name', stopping: { mode: 'fixed', level: 'balanced', maxEpochs: null } })
    expect(mergeImportedTechnicalFields(base, imported)).toMatchObject({
      id: base.id, name: base.name, author: base.author, stopping: imported.stopping
    })
  })
})
