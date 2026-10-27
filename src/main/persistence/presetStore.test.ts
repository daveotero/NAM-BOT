import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPaths = vi.hoisted(() => ({
  userDataPath: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-preset-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataPath,
    getVersion: () => '0.6.2'
  }
}))

import { EPOCH_RUNNER_REWARD_PRESET_ID } from '../../shared/reward-preset'
import { createTrainingPreset, DEFAULT_PRESET_ID, A2_HEAVY_12_PRESET_ID, A2_ULTRA_20_PRESET_ID } from '../../shared/training'
import { deleteTrainingPreset, getPresetLoadWarnings, getTrainingPresetById, listTrainingPresets, saveTrainingPreset } from './presetStore'

beforeEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
  mkdirSync(mockPaths.userDataPath, { recursive: true })
})

afterEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
})

describe('preset path validation', () => {
  it('uses current bundled names even when older built-in files exist', () => {
    const directory = join(mockPaths.userDataPath, 'presets')
    mkdirSync(directory)
    const names = [
      [DEFAULT_PRESET_ID, 'A2 Packed WaveNet', 'A2 Standard'],
      [A2_HEAVY_12_PRESET_ID, 'A2 Packed WaveNet Heavy 12', 'A2 Heavy 12'],
      [A2_ULTRA_20_PRESET_ID, 'A2 Packed WaveNet Ultra 20', 'A2 Ultra 20']
    ]
    for (const [id, oldName] of names) {
      writeFileSync(join(directory, `${id}.json`), JSON.stringify(createTrainingPreset({
        id, name: oldName, builtIn: true, readOnly: true
      })))
    }
    const custom = saveTrainingPreset(createTrainingPreset({ id: 'my-copy', name: 'A2 Packed WaveNet' }))
    for (const [id, , currentName] of names) {
      expect(listTrainingPresets().filter((preset) => preset.id === id)).toHaveLength(1)
      expect(getTrainingPresetById(id)).toMatchObject({ name: currentName, builtIn: true, readOnly: true })
    }
    expect(getTrainingPresetById(custom.id).name).toBe('A2 Packed WaveNet')
  })

  it('deletes legacy export filenames and duplicate copies by their stored ID', () => {
    const preset = saveTrainingPreset(createTrainingPreset({ id: 'preset-1773692588983', name: 'REVxSTD' }))
    const directory = join(mockPaths.userDataPath, 'presets')
    const legacyPath = join(directory, 'revxstd.nam-bot-preset.json')
    writeFileSync(legacyPath, JSON.stringify(preset))
    writeFileSync(`${legacyPath}.bak`, JSON.stringify(preset))
    const other = saveTrainingPreset(createTrainingPreset({ id: 'other', name: 'REVxSTD' }))
    deleteTrainingPreset(preset.id)
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.bak`)).toBe(false)
    expect(listTrainingPresets().some((entry) => entry.id === preset.id)).toBe(false)
    expect(getTrainingPresetById(other.id).name).toBe(other.name)
  })

  it('lists a preset once when a copied export shares its ID, preferring the saved file', () => {
    const directory = join(mockPaths.userDataPath, 'presets')
    mkdirSync(directory)
    const legacy = createTrainingPreset({ id: 'shared-id', name: 'Copied export' })
    writeFileSync(join(directory, 'aaa copied.nam-bot-preset.json'), JSON.stringify(legacy))
    writeFileSync(join(directory, 'zzz copied.nam-bot-preset.json'), JSON.stringify(legacy))
    expect(listTrainingPresets().filter((preset) => preset.id === legacy.id)).toHaveLength(1)

    // Editing the copied preset saves <id>.json; the library then shows that version.
    saveTrainingPreset({ ...legacy, name: 'Edited copy' })
    const listed = listTrainingPresets().filter((preset) => preset.id === legacy.id)
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Edited copy')
  })

  it.each(['missing', 'corrupt'])('deletes a legacy backup when its primary is %s', (primary) => {
    const directory = join(mockPaths.userDataPath, 'presets')
    mkdirSync(directory)
    const legacyPath = join(directory, 'old-export.nam-bot-preset.json')
    const preset = createTrainingPreset({ id: 'legacy-id', name: 'Old import' })
    writeFileSync(`${legacyPath}.bak`, JSON.stringify(preset))
    if (primary === 'corrupt') writeFileSync(legacyPath, '{broken')
    expect(getTrainingPresetById(preset.id).name).toBe(preset.name)
    deleteTrainingPreset(preset.id)
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.bak`)).toBe(false)
    expect(() => getTrainingPresetById(preset.id)).toThrow('unavailable')
  })

  it('recovers corrupt and missing primary files from backups and reports the recovery', () => {
    const preset = saveTrainingPreset(createTrainingPreset({ id: 'recover-me', name: 'Recover me' }))
    saveTrainingPreset(preset)
    const path = join(mockPaths.userDataPath, 'presets', 'recover-me.json')
    writeFileSync(path, '{broken')
    expect(getTrainingPresetById(preset.id).name).toBe('Recover me')
    expect(getPresetLoadWarnings()[0]).toContain('Recovered')
    rmSync(path)
    expect(getTrainingPresetById(preset.id).name).toBe('Recover me')
    deleteTrainingPreset(preset.id)
    expect(listTrainingPresets().some((entry) => entry.id === preset.id)).toBe(false)
    expect(() => getTrainingPresetById(preset.id)).toThrow('unavailable')
  })

  it('saves a preset listed from its backup in place instead of adding a copy', () => {
    const preset = saveTrainingPreset(createTrainingPreset({ id: 'backup-only', name: 'Backup only' }))
    saveTrainingPreset(preset)
    writeFileSync(join(mockPaths.userDataPath, 'presets', 'backup-only.json'), '{broken')
    expect(saveTrainingPreset({ ...preset, name: 'Edited' }).id).toBe('backup-only')
    expect(listTrainingPresets().filter((entry) => !entry.builtIn).map((entry) => entry.name)).toEqual(['Edited'])
  })

  it('never saves the reward preset under another ID', () => {
    const directory = join(mockPaths.userDataPath, 'presets')
    mkdirSync(directory)
    const reward = createTrainingPreset({ id: EPOCH_RUNNER_REWARD_PRESET_ID, name: 'Reward' })
    const rewardPath = join(directory, `${EPOCH_RUNNER_REWARD_PRESET_ID}.json`)
    writeFileSync(rewardPath, '{broken')
    expect(() => saveTrainingPreset(reward)).toThrow('could not be read')
    writeFileSync(rewardPath, JSON.stringify({ ...reward, createdAt: '2026-01-01T00:00:00.000Z' }))
    expect(() => saveTrainingPreset(reward)).toThrow('already uses the reward preset ID')
    expect(readdirSync(directory)).toEqual([`${EPOCH_RUNNER_REWARD_PRESET_ID}.json`])
  })

  it('rejects traversal IDs for save and delete', () => {
    const unsafePreset = createTrainingPreset({
      id: '../settings',
      name: 'Unsafe preset'
    })

    expect(() => saveTrainingPreset(unsafePreset)).toThrow('Preset ID')
    expect(() => deleteTrainingPreset('..\\settings')).toThrow('Preset ID')
    expect(existsSync(join(mockPaths.userDataPath, 'settings.json'))).toBe(false)
  })

  it('saves a valid preset inside the preset directory', () => {
    const preset = createTrainingPreset({
      id: 'safe-preset_1',
      name: 'Safe preset',
      stopping: { mode: 'convergence', level: 'thorough', maxEpochs: 3200 }
    })

    const saved = saveTrainingPreset(preset)

    expect(saved.id).toBe('safe-preset_1')
    expect(getTrainingPresetById(saved.id).stopping).toEqual(preset.stopping)
    expect(existsSync(join(mockPaths.userDataPath, 'presets', 'safe-preset_1.json'))).toBe(true)
  })
})
