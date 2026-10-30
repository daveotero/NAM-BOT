import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import log from 'electron-log/main'
import {
  DEFAULT_PRESET_ID,
  TrainingPresetFile,
  builtInTrainingPresets,
  createTrainingPreset,
  getPresetArchitectureVersion,
  normalizeTrainingPreset,
  slugifyPresetName
} from '../types/jobs'
import { isEpochRunnerRewardPresetId } from '../../shared/reward-preset'
import { atomicWriteJsonSync, readJsonWithBackupSync } from './atomicFile'

const userPresetsPath = join(app.getPath('userData'), 'presets')
let presetLoadWarnings: string[] = []

export function getPresetLoadWarnings(): string[] {
  return [...presetLoadWarnings]
}

export function getUserPresetsPath(): string {
  return userPresetsPath
}
const epochRunnerRewardPresetName = 'Converged Night Run'

function isEpochRunnerRewardPreset(preset: TrainingPresetFile): boolean {
  return isEpochRunnerRewardPresetId(preset.id)
    || preset.name === epochRunnerRewardPresetName
    || preset.description.includes('Epoch Runner')
}

function buildStoredPresetOrigin(preset: TrainingPresetFile): TrainingPresetFile['origin'] {
  return {
    app: preset.origin?.app?.trim() || 'NAM-BOT',
    version: preset.origin?.version?.trim() || app.getVersion()
  }
}

function ensurePresetDirectory(): void {
  if (!existsSync(userPresetsPath)) {
    mkdirSync(userPresetsPath, { recursive: true })
  }
}

function getPresetFilePath(presetId: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(presetId)) {
    throw new Error('Preset ID must contain only letters, numbers, underscores, and hyphens.')
  }

  const targetPath = resolve(userPresetsPath, `${presetId}.json`)
  const presetRoot = `${resolve(userPresetsPath)}${sep}`
  if (!targetPath.startsWith(presetRoot) || basename(targetPath) !== `${presetId}.json`) {
    throw new Error('Preset path must remain inside the preset directory.')
  }
  return targetPath
}

function listUserPresetsInternal(): TrainingPresetFile[] {
  ensurePresetDirectory()
  const presets = new Map<string, TrainingPresetFile>()
  presetLoadWarnings = []
  const fileNames = new Set(readdirSync(userPresetsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json(?:\.bak)?$/i.test(entry.name))
    .map((entry) => entry.name.replace(/\.bak$/i, '')))

  for (const fileName of fileNames) {
    const fullPath = join(userPresetsPath, fileName)
    try {
      const raw = readJsonWithBackupSync(fullPath, () => {
        presetLoadWarnings.push(`Recovered ${fileName} from its backup. Export or save the recovered preset to keep a fresh copy.`)
      })
      const preset = normalizeTrainingPreset(raw)
      if (preset.builtIn) {
        continue
      }
      // A copied export or legacy filename can share an ID with the file that saves
      // write (<id>.json). List each ID once and prefer that saved file.
      if (presets.has(preset.id) && fileName.toLowerCase() !== `${preset.id}.json`.toLowerCase()) {
        continue
      }
      presets.set(preset.id, { ...preset, builtIn: false, readOnly: false })
    } catch (error) {
      log.warn('Failed to read preset file:', fullPath, error)
      presetLoadWarnings.push(`Could not load ${fileName} or its backup. Restore this preset before queueing drafts that use it.`)
    }
  }

  return [...presets.values()]
}

function getPresetSortBucket(preset: TrainingPresetFile): number {
  if (preset.builtIn) {
    return 2
  }

  if (isEpochRunnerRewardPreset(preset)) {
    return 1
  }

  return 0
}

function getPresetArchitectureSortBucket(preset: TrainingPresetFile): number {
  switch (getPresetArchitectureVersion(preset)) {
    case 'a2':
      return 0
    case 'a1':
      return 1
    case 'custom':
    default:
      return 2
  }
}

function sortTrainingPresets(presets: TrainingPresetFile[]): TrainingPresetFile[] {
  const builtInOrder = new Map<string, number>(
    builtInTrainingPresets.map((preset, index) => [preset.id, index])
  )

  return [...presets].sort((left, right) => {
    const leftArchitectureBucket = getPresetArchitectureSortBucket(left)
    const rightArchitectureBucket = getPresetArchitectureSortBucket(right)

    if (leftArchitectureBucket !== rightArchitectureBucket) {
      return leftArchitectureBucket - rightArchitectureBucket
    }

    const leftBucket = getPresetSortBucket(left)
    const rightBucket = getPresetSortBucket(right)

    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket
    }

    if (leftBucket === 2) {
      return (builtInOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (builtInOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    }

    return left.name.localeCompare(right.name)
  })
}

export function listTrainingPresets(): TrainingPresetFile[] {
  return sortTrainingPresets([...listUserPresetsInternal(), ...builtInTrainingPresets])
}

export function getTrainingPresetById(presetId: string | null | undefined): TrainingPresetFile {
  const allPresets = listTrainingPresets()
  const preset = allPresets.find((entry) => entry.id === (presetId ?? DEFAULT_PRESET_ID))
  if (!preset) {
    throw new Error(`Preset "${presetId}" is unavailable. Edit the draft and select an available preset.`)
  }
  return preset
}

export function saveTrainingPreset(input: unknown): TrainingPresetFile {
  const preset = normalizeTrainingPreset(input)
  if (preset.builtIn || preset.readOnly) {
    throw new Error('Built-in presets are read-only.')
  }

  ensurePresetDirectory()
  let presetId = preset.id
  const targetPath = getPresetFilePath(presetId)
  if (existsSync(targetPath) || existsSync(`${targetPath}.bak`)) {
    let existing: TrainingPresetFile | null = null
    try {
      // Read it the way the library does, so a preset listed from its backup saves in place.
      existing = normalizeTrainingPreset(readJsonWithBackupSync(targetPath))
    } catch (error) {
      log.warn('Could not read the preset file a save would replace:', targetPath, error)
    }
    const isSamePreset = existing !== null && existing.id === preset.id && existing.createdAt === preset.createdAt
    if (!isSamePreset) {
      if (isEpochRunnerRewardPresetId(preset.id)) {
        // The library only recognizes a reward by its ID: a copy under another ID would
        // leave the reward locked and add another copy on every attempt.
        throw new Error(existing
          ? `Another preset already uses the reward preset ID "${preset.id}".`
          : `The existing reward preset file ${basename(targetPath)} could not be read. Restore or remove it in the presets folder, then try again.`)
      }
      presetId = `${slugifyPresetName(preset.name)}-${Date.now()}`
    }
  }

  const normalized = createTrainingPreset({
    ...preset,
    id: presetId,
    builtIn: false,
    readOnly: false,
    visible: true,
    updatedAt: new Date().toISOString(),
    origin: buildStoredPresetOrigin(preset)
  })
  atomicWriteJsonSync(getPresetFilePath(normalized.id), normalized)
  return normalized
}

export function deleteTrainingPreset(presetId: string): void {
  const builtIn = builtInTrainingPresets.some((preset) => preset.id === presetId)
  if (builtIn) {
    return
  }

  const target = getPresetFilePath(presetId)
  const targets = new Set([target])
  ensurePresetDirectory()
  // Older imports kept their exported filenames instead of using the preset ID.
  const fileNames = new Set(readdirSync(userPresetsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json(?:\.bak)?$/i.test(entry.name))
    .map((entry) => entry.name.replace(/\.bak$/i, '')))
  for (const fileName of fileNames) {
    const fullPath = join(userPresetsPath, fileName)
    try {
      const preset = normalizeTrainingPreset(readJsonWithBackupSync(fullPath))
      if (!preset.builtIn && preset.id === presetId) {
        targets.add(fullPath)
      }
    } catch {
      // An unreadable, unrelated preset must not prevent deleting this one.
    }
  }
  for (const presetPath of targets) {
    // Remove the backup first so it cannot restore a deleted primary file.
    if (existsSync(`${presetPath}.bak`)) unlinkSync(`${presetPath}.bak`)
    if (existsSync(presetPath)) unlinkSync(presetPath)
  }
}
