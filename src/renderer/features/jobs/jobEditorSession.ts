import type { AppSettings, JobEditorSession, JobOutputRootMode } from '../../state/store'
import {
  DEFAULT_PRESET_ID,
  type JobSpec,
  type TrainingPresetFile,
  defaultJobSpec
} from '../../state/types'
import { getDirname } from './job-helpers'

export const LAST_USED_PRESET_STORAGE_KEY = 'nam-bot:last-used-preset-id'
export const LAST_APPEND_PRESET_NAME_STORAGE_KEY = 'nam-bot:last-append-preset-name'
export const LAST_APPEND_ESR_STORAGE_KEY = 'nam-bot:last-append-esr'
export const LAST_OUTPUT_ROOT_MODE_STORAGE_KEY = 'nam-bot:last-output-root-mode'
export const LAST_CUSTOM_OUTPUT_ROOT_STORAGE_KEY = 'nam-bot:last-custom-output-root'
export const VIRTUAL_NEW_JOB_ID = 'new-draft-virtual'

interface CreateNewJobDraftOptions {
  presets: TrainingPresetFile[]
  settings: AppSettings | null
}

interface PreferredOutputRootSelection {
  mode: JobOutputRootMode
  outputRootDir: string
  outputRootDirIsDefault: boolean
}

function getSettingsDefaultOutputRoot(settings: AppSettings | null): string | null {
  const trimmed = settings?.defaultOutputRoot?.trim() || ''
  return trimmed.length > 0 ? trimmed : null
}

function getOutputRootModeForJob(job: JobSpec, settings: AppSettings | null): JobOutputRootMode {
  const settingsDefaultOutputRoot = getSettingsDefaultOutputRoot(settings)

  if (job.outputRootDirIsDefault) {
    return 'output-audio'
  }

  if (settingsDefaultOutputRoot && job.outputRootDir === settingsDefaultOutputRoot) {
    return 'settings-default'
  }

  return 'custom'
}

export function getStoredAppendPresetToModelFileNamePreference(): boolean {
  return window.localStorage.getItem(LAST_APPEND_PRESET_NAME_STORAGE_KEY) === 'true'
}

export function getStoredAppendEsrToModelFileNamePreference(): boolean {
  return window.localStorage.getItem(LAST_APPEND_ESR_STORAGE_KEY) === 'true'
}

export function getStoredCustomOutputRootPreference(): string | null {
  const trimmed = window.localStorage.getItem(LAST_CUSTOM_OUTPUT_ROOT_STORAGE_KEY)?.trim() || ''
  return trimmed.length > 0 ? trimmed : null
}

export function getPreferredOutputRootSelection(
  settings: AppSettings | null,
  outputAudioPath: string
): PreferredOutputRootSelection {
  const settingsDefaultOutputRoot = getSettingsDefaultOutputRoot(settings)
  const storedCustomOutputRoot = getStoredCustomOutputRootPreference()
  const storedMode = window.localStorage.getItem(LAST_OUTPUT_ROOT_MODE_STORAGE_KEY)

  if (storedMode === 'settings-default' && settingsDefaultOutputRoot) {
    return {
      mode: 'settings-default',
      outputRootDir: settingsDefaultOutputRoot,
      outputRootDirIsDefault: false
    }
  }

  if (storedMode === 'custom' && storedCustomOutputRoot) {
    return {
      mode: 'custom',
      outputRootDir: storedCustomOutputRoot,
      outputRootDirIsDefault: false
    }
  }

  if (storedMode === 'output-audio') {
    return {
      mode: 'output-audio',
      outputRootDir: outputAudioPath ? getDirname(outputAudioPath) : '',
      outputRootDirIsDefault: true
    }
  }

  if (settingsDefaultOutputRoot) {
    return {
      mode: 'settings-default',
      outputRootDir: settingsDefaultOutputRoot,
      outputRootDirIsDefault: false
    }
  }

  return {
    mode: 'output-audio',
    outputRootDir: outputAudioPath ? getDirname(outputAudioPath) : '',
    outputRootDirIsDefault: true
  }
}

export function persistOutputRootPreference(mode: JobOutputRootMode, outputRootDir: string): void {
  window.localStorage.setItem(LAST_OUTPUT_ROOT_MODE_STORAGE_KEY, mode)

  if (mode === 'custom') {
    const trimmed = outputRootDir.trim()
    if (trimmed.length > 0) {
      window.localStorage.setItem(LAST_CUSTOM_OUTPUT_ROOT_STORAGE_KEY, trimmed)
    }
  }
}

export function buildJobEditorSession(title: string, job: JobSpec, settings: AppSettings | null): JobEditorSession {
  const sessionContent = {
    job,
    inputMode: job.inputAudioIsDefault ? 'default' as const : 'custom' as const,
    outputRootMode: getOutputRootModeForJob(job, settings)
  }

  return {
    title,
    initialSnapshot: JSON.stringify(sessionContent),
    ...sessionContent,
    showValidationErrors: false
  }
}

export function createNewJobDraft(options: CreateNewJobDraftOptions): JobSpec {
  const visiblePresets = options.presets.filter((preset) => preset.visible)
  const storedPresetId = window.localStorage.getItem(LAST_USED_PRESET_STORAGE_KEY)
  const fallbackPreset = visiblePresets.find((preset) => preset.id === storedPresetId)
    ?? visiblePresets.find((preset) => preset.id === DEFAULT_PRESET_ID)
    ?? visiblePresets[0]
  const preferredOutputRootSelection = getPreferredOutputRootSelection(options.settings, '')

  const newJob: JobSpec = {
    ...(JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>),
    id: VIRTUAL_NEW_JOB_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    presetId: fallbackPreset?.id ?? DEFAULT_PRESET_ID,
    appendPresetToModelFileName: getStoredAppendPresetToModelFileNamePreference(),
    appendEsrToModelFileName: getStoredAppendEsrToModelFileNamePreference(),
    outputRootDir: preferredOutputRootSelection.outputRootDir,
    outputRootDirIsDefault: preferredOutputRootSelection.outputRootDirIsDefault
  }

  if (options.settings?.defaultAuthorName) {
    newJob.metadata.modeledBy = options.settings.defaultAuthorName
  }

  if (fallbackPreset) {
    newJob.trainingOverrides.epochs = fallbackPreset.values.epochs
  }

  return newJob
}
