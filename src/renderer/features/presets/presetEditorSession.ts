import type { AppSettings, PresetEditorSession } from '../../state/store'
import {
  createTrainingPreset,
  normalizeTrainingPreset,
  type TrainingPresetFile
} from '../../state/types'

function prettyJson(value: Record<string, unknown> | undefined): string {
  return value ? JSON.stringify(value, null, 2) : ''
}

export function mergeImportedTechnicalFields(basePreset: TrainingPresetFile, importedPreset: TrainingPresetFile): TrainingPresetFile {
  return normalizeTrainingPreset({
    ...basePreset,
    values: importedPreset.values,
    expert: importedPreset.expert,
    stopping: importedPreset.stopping ?? basePreset.stopping,
    builtIn: false,
    readOnly: false,
    visible: true
  })
}

export function buildNewPresetDraft(settings: AppSettings | null): TrainingPresetFile {
  return createTrainingPreset({
    id: `preset-${Date.now()}`,
    name: 'New Custom Preset',
    description: '',
    category: 'custom',
    author: {
      name: settings?.defaultAuthorName || '',
      url: settings?.defaultAuthorUrl || ''
    },
    builtIn: false,
    readOnly: false,
    visible: true
  })
}

export function buildPresetEditorSession(title: string, preset: TrainingPresetFile): PresetEditorSession {
  const normalized = normalizeTrainingPreset(preset)
  const sessionContent = {
    preset: normalized,
    dataJson: prettyJson(normalized.expert.data),
    modelJson: prettyJson(normalized.expert.model),
    learningJson: prettyJson(normalized.expert.learning),
    editorMode: 'manual' as const,
    importJson: ''
  }

  return {
    title,
    initialSnapshot: JSON.stringify(sessionContent),
    ...sessionContent
  }
}
