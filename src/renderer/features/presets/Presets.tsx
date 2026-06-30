import { type ClipboardEvent, type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import JsonCodeEditor, { type JsonEditorError } from '../../components/JsonCodeEditor'
import { type AppSettings, type PresetEditorSession, useAppStore } from '../../state/store'
import {
  type ArchitectureSize,
  type ImportedPresetResult,
  type ModelFamily,
  type NamArchitectureVersion,
  type PresetCategory,
  type TrainingPresetFile,
  buildLstmConfig,
  buildWaveNetConfig,
  createImportedPreset,
  createTrainingPreset,
  formatPackedSubmodelDisplayName,
  formatPresetArchitectureTag,
  getPackedSubmodelsForPreset,
  normalizeTrainingPreset
} from '../../state/types'
import { handleCardToggleKeyDown, shouldIgnoreCardToggle } from '../../utils/card-toggle'
import { isEpochRunnerRewardPreset } from '../about/aboutRewardPreset'
import { buildNewPresetDraft, buildPresetEditorSession } from './presetEditorSession'

const PRESET_CATEGORY_OPTIONS: Array<{ value: PresetCategory; label: string }> = [
  { value: 'quality', label: 'Quality' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'speed', label: 'Speed' },
  { value: 'custom', label: 'Custom' }
]

const MODEL_FAMILY_OPTIONS: Array<{ value: ModelFamily; label: string }> = [
  { value: 'PackedWaveNet', label: 'Packed WaveNet' },
  { value: 'WaveNet', label: 'WaveNet' },
  { value: 'LSTM', label: 'LSTM' }
]

const ARCHITECTURE_VERSION_OPTIONS: Array<{ value: NamArchitectureVersion; label: string }> = [
  { value: 'a2', label: 'A2' },
  { value: 'a1', label: 'A1' },
  { value: 'custom', label: 'Custom' }
]

const ARCHITECTURE_OPTIONS: Array<{ value: ArchitectureSize; label: string }> = [
  { value: 'packed', label: 'Packed' },
  { value: 'standard', label: 'Standard' },
  { value: 'lite', label: 'Lite' },
  { value: 'feather', label: 'Feather' },
  { value: 'nano', label: 'Nano' },
  { value: 'custom', label: 'Custom' }
]

const BASIC_FIELD_HELP_TEXT = {
  name: 'Library label only. Use something that helps you remember the amp, pedal, gain stage, or experiment.',
  category: 'Organizer only. This does not change training, just how the preset is grouped in your library.',
  description: 'Quick note for what this profile is aiming at, what source files it came from, or what sounded best.',
  architectureVersion: 'a2 is the current NAM architecture. a1 remains available for older workflows. custom marks experimental local recipes.',
  modelFamily: 'Packed WaveNet is the A2 path. WaveNet and LSTM are available for a1 and custom local experiments.',
  architectureSize: 'A2 uses Packed, which trains Lite and Full together. a1 presets still use Standard, Lite, Feather, or Nano.',
  epochs: 'How many passes NAM makes over the training material. More can improve the fit, but too many can start chasing noise or mismatches.',
  batchSize: 'Mostly a speed and memory knob. Raise it if your GPU has room; lower it if training runs out of memory.',
  learningRate: 'How aggressively the model updates while learning. Too high can make training unstable; too low can make it crawl.',
  learningRateDecay: 'How quickly the learning rate backs off as training goes on. Higher decay means a stronger early push and gentler late fine-tuning.',
  ny: 'Training window length. Larger values give NAM a longer slice of the signal to learn from, but they cost more memory and time.',
  fitMrstft: 'Adds an extra frequency-aware loss term. It can help preserve texture and top-end detail on some rigs, but it changes how the fit behaves.',
  mrstftWeight: 'Numeric strength of the MRSTFT loss. Official A2 uses 0.0005.',
  weightDecay: 'Adam optimizer weight decay. Official A2 uses a tiny value to regularize training.',
  outputNormalizeRmsDb: 'A2 normalizes training output to a fixed RMS target before folding level back into the exported model.'
} as const


interface JsonValidationState {
  error: JsonEditorError | null
  parsed: Record<string, unknown> | null
}

interface ImportValidationState {
  imported: ImportedPresetResult | null
  error: JsonEditorError | null
}

type BasicFieldKey =
  | 'architectureVersion'
  | 'modelFamily'
  | 'architectureSize'
  | 'epochs'
  | 'batchSize'
  | 'learningRate'
  | 'learningRateDecay'
  | 'ny'
  | 'fitMrstft'
  | 'mrstftWeight'
  | 'weightDecay'
  | 'outputNormalizeRmsDb'

interface BasicFieldOverride {
  source: string
  displayValue: string
  controlValue?: string | number | boolean
}

interface PresetCardProps {
  preset: TrainingPresetFile
  isExpanded: boolean
  onToggleExpanded: (presetId: string) => void
  onEdit: (preset: TrainingPresetFile) => void
  onDuplicate: (preset: TrainingPresetFile) => void
  onDelete: (preset: TrainingPresetFile) => Promise<void>
  onExport: (preset: TrainingPresetFile) => Promise<void>
  onCopyJson: (preset: TrainingPresetFile) => Promise<void>
}

interface PresetEditorProps {
  session: PresetEditorSession
  onSessionChange: (session: PresetEditorSession) => void
  onSave: (preset: TrainingPresetFile) => Promise<void>
  onCancel: () => void
}

const PRESET_EDITOR_FORM_ID = 'preset-editor-form'

function parseOptionalJsonBlock(label: string, value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} JSON must be an object.`)
  }

  return parsed as Record<string, unknown>
}

function parsePresetCategory(value: string, fallback: PresetCategory): PresetCategory {
  const matched = PRESET_CATEGORY_OPTIONS.find((option) => option.value === value)
  return matched?.value ?? fallback
}

function parseModelFamily(value: string, fallback: ModelFamily): ModelFamily {
  const matched = MODEL_FAMILY_OPTIONS.find((option) => option.value === value)
  return matched?.value ?? fallback
}

function parseArchitectureVersion(value: string, fallback: NamArchitectureVersion): NamArchitectureVersion {
  const matched = ARCHITECTURE_VERSION_OPTIONS.find((option) => option.value === value)
  return matched?.value ?? fallback
}

function parseArchitectureSize(value: string, fallback: ArchitectureSize): ArchitectureSize {
  const matched = ARCHITECTURE_OPTIONS.find((option) => option.value === value)
  return matched?.value ?? fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatPresetCategory(category: PresetCategory): string {
  return PRESET_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? 'Custom'
}

function formatArchitectureSize(size: ArchitectureSize): string {
  return ARCHITECTURE_OPTIONS.find((option) => option.value === size)?.label ?? 'Custom'
}

function formatImportKind(kind: ImportedPresetResult['kind']): string {
  switch (kind) {
    case 'full-preset':
      return 'full preset'
    case 'expert-config':
      return 'expert config'
    case 'wavenet-snippet':
      return 'WaveNet snippet'
    case 'lstm-snippet':
      return 'LSTM snippet'
    default:
      return 'preset JSON'
  }
}

function getPresetOwnershipBadge(preset: TrainingPresetFile): { label: string; className: string } {
  if (isEpochRunnerRewardPreset(preset)) {
    return {
      label: 'Epoch Runner Reward',
      className: 'reward'
    }
  }

  return {
    label: preset.builtIn ? 'Built-in' : 'User',
    className: preset.builtIn ? 'queued' : 'running'
  }
}

function getExpertOverrideSummary(preset: TrainingPresetFile): string {
  const labels: string[] = []

  if (preset.expert.data) {
    labels.push('Data')
  }

  if (preset.expert.model) {
    labels.push('Model')
  }

  if (preset.expert.learning) {
    labels.push('Learning')
  }

  return labels.length > 0 ? labels.join(', ') : 'None'
}

function getPackedSubmodelSummary(preset: TrainingPresetFile): string | null {
  const labels = getPackedSubmodelsForPreset(preset).map(formatPackedSubmodelDisplayName)

  return labels.length > 0 ? `${labels.length} tiers: ${labels.join(', ')}` : null
}

function getNestedValue(
  root: Record<string, unknown> | null,
  path: string[]
): { found: boolean; value: unknown } {
  let current: unknown = root

  for (const segment of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return {
        found: false,
        value: undefined
      }
    }

    current = current[segment]
  }

  return {
    found: true,
    value: current
  }
}

function getOutputNormalizeRmsDbOverride(data: Record<string, unknown> | null): BasicFieldOverride | null {
  if (!Array.isArray(data?.joint)) {
    return null
  }

  const outputNormalizeStep = data.joint.find((entry) => (
    isRecord(entry)
    && entry.name === 'nam.data.normalize_joint_dataset_output'
    && isRecord(entry.kwargs)
  ))

  if (!isRecord(outputNormalizeStep) || !isRecord(outputNormalizeStep.kwargs)) {
    return null
  }

  const value = outputNormalizeStep.kwargs.level_rms_dbfs
  return {
    source: 'Data JSON -> joint.normalize_joint_dataset_output',
    displayValue: String(value),
    controlValue: typeof value === 'number' ? value : undefined
  }
}

function formatCompactNumber(value: number): string {
  return Number(value.toFixed(6)).toString()
}

function inferArchitectureSize(modelFamily: ModelFamily, config: unknown): ArchitectureSize {
  if (modelFamily === 'PackedWaveNet') {
    return 'packed'
  }

  if (!isRecord(config)) {
    return 'custom'
  }

  const candidates: ArchitectureSize[] = ['standard', 'lite', 'feather', 'nano']
  const serializedConfig = JSON.stringify(config)

  for (const candidate of candidates) {
    const built = modelFamily === 'LSTM'
      ? buildLstmConfig(candidate)
      : buildWaveNetConfig(candidate)

    if (JSON.stringify(built) === serializedConfig) {
      return candidate
    }
  }

  return 'custom'
}

function getStringControlValue(override: BasicFieldOverride | null, fallback: string): string {
  return typeof override?.controlValue === 'string' ? override.controlValue : fallback
}

function getNumberControlValue(override: BasicFieldOverride | null, fallback: number): number {
  return typeof override?.controlValue === 'number' ? override.controlValue : fallback
}

function getBooleanControlValue(override: BasicFieldOverride | null, fallback: boolean): boolean {
  return typeof override?.controlValue === 'boolean' ? override.controlValue : fallback
}

function getOptionalNumberControlValue(override: BasicFieldOverride | null, fallback: number | null): number | '' {
  if (typeof override?.controlValue === 'number') {
    return override.controlValue
  }
  return fallback ?? ''
}

function buildBasicFieldOverrides(
  data: Record<string, unknown> | null,
  model: Record<string, unknown> | null,
  learning: Record<string, unknown> | null,
  preset: TrainingPresetFile
): Record<BasicFieldKey, BasicFieldOverride | null> {
  const overrides: Record<BasicFieldKey, BasicFieldOverride | null> = {
    architectureVersion: null,
    modelFamily: null,
    architectureSize: null,
    epochs: null,
    batchSize: null,
    learningRate: null,
    learningRateDecay: null,
    ny: null,
    fitMrstft: null,
    mrstftWeight: null,
    weightDecay: null,
    outputNormalizeRmsDb: null
  }

  const modelFamilyValue = getNestedValue(model, ['net', 'name'])
  if (modelFamilyValue.found) {
    const displayValue = typeof modelFamilyValue.value === 'string'
      ? modelFamilyValue.value
      : String(modelFamilyValue.value)

    overrides.modelFamily = {
      source: 'Model JSON -> net.name',
      displayValue,
      controlValue: displayValue === 'WaveNet' || displayValue === 'LSTM' || displayValue === 'PackedWaveNet' ? displayValue : undefined
    }
    overrides.architectureVersion = {
      source: 'Model JSON -> net.name',
      displayValue: displayValue === 'PackedWaveNet' ? 'a2' : displayValue === 'WaveNet' || displayValue === 'LSTM' ? 'a1' : 'custom',
      controlValue: displayValue === 'PackedWaveNet' ? 'a2' : displayValue === 'WaveNet' || displayValue === 'LSTM' ? 'a1' : 'custom'
    }
  }

  const effectiveModelFamilyValue = getStringControlValue(overrides.modelFamily, preset.values.modelFamily)
  const effectiveModelFamily: ModelFamily = effectiveModelFamilyValue === 'LSTM'
    ? 'LSTM'
    : effectiveModelFamilyValue === 'PackedWaveNet'
      ? 'PackedWaveNet'
      : 'WaveNet'

  const architectureValue = getNestedValue(model, ['net', 'config'])
  if (architectureValue.found) {
    const inferredSize = inferArchitectureSize(effectiveModelFamily, architectureValue.value)
    overrides.architectureSize = {
      source: 'Model JSON -> net.config',
      displayValue: formatArchitectureSize(inferredSize),
      controlValue: inferredSize
    }
  }

  const epochsValue = getNestedValue(learning, ['trainer', 'max_epochs'])
  if (epochsValue.found) {
    overrides.epochs = {
      source: 'Learning JSON -> trainer.max_epochs',
      displayValue: String(epochsValue.value),
      controlValue: typeof epochsValue.value === 'number' ? epochsValue.value : undefined
    }
  }

  const batchSizeValue = getNestedValue(learning, ['train_dataloader', 'batch_size'])
  if (batchSizeValue.found) {
    overrides.batchSize = {
      source: 'Learning JSON -> train_dataloader.batch_size',
      displayValue: String(batchSizeValue.value),
      controlValue: typeof batchSizeValue.value === 'number' ? batchSizeValue.value : undefined
    }
  }

  const learningRateValue = getNestedValue(model, ['optimizer', 'lr'])
  if (learningRateValue.found) {
    overrides.learningRate = {
      source: 'Model JSON -> optimizer.lr',
      displayValue: String(learningRateValue.value),
      controlValue: typeof learningRateValue.value === 'number' ? learningRateValue.value : undefined
    }
  }

  const gammaValue = getNestedValue(model, ['lr_scheduler', 'kwargs', 'gamma'])
  if (gammaValue.found) {
    const learningRateDecay = typeof gammaValue.value === 'number'
      ? Math.max(0, 1 - gammaValue.value)
      : undefined

    overrides.learningRateDecay = {
      source: 'Model JSON -> lr_scheduler.kwargs.gamma',
      displayValue: learningRateDecay == null ? String(gammaValue.value) : formatCompactNumber(learningRateDecay),
      controlValue: learningRateDecay
    }
  }

  const nyValue = getNestedValue(data, ['train', 'ny'])
  if (nyValue.found) {
    overrides.ny = {
      source: 'Data JSON -> train.ny',
      displayValue: String(nyValue.value),
      controlValue: typeof nyValue.value === 'number' ? nyValue.value : undefined
    }
  }

  overrides.outputNormalizeRmsDb = getOutputNormalizeRmsDbOverride(data)

  const mrstftWeight = getNestedValue(model, ['loss', 'pre_emph_mrstft_weight'])
  const mrstftCoef = getNestedValue(model, ['loss', 'pre_emph_mrstft_coef'])
  const directMrstftWeight = getNestedValue(model, ['loss', 'mrstft_weight'])
  if (mrstftWeight.found || mrstftCoef.found || directMrstftWeight.found) {
    const weightValue = directMrstftWeight.found ? directMrstftWeight.value : mrstftWeight.value
    const enabled = typeof weightValue === 'number'
      ? weightValue > 0
      : typeof mrstftWeight.value === 'number'
        ? mrstftWeight.value > 0
        : mrstftCoef.found

    overrides.fitMrstft = {
      source: mrstftWeight.found
        ? 'Model JSON -> loss.pre_emph_mrstft_weight'
        : 'Model JSON -> loss.pre_emph_mrstft_coef',
      displayValue: enabled ? 'Enabled' : 'Disabled',
      controlValue: enabled
    }
    if (typeof weightValue === 'number') {
      overrides.mrstftWeight = {
        source: directMrstftWeight.found
          ? 'Model JSON -> loss.mrstft_weight'
          : 'Model JSON -> loss.pre_emph_mrstft_weight',
        displayValue: formatCompactNumber(weightValue),
        controlValue: weightValue
      }
    }
  }

  const weightDecayValue = getNestedValue(model, ['optimizer', 'weight_decay'])
  if (weightDecayValue.found) {
    overrides.weightDecay = {
      source: 'Model JSON -> optimizer.weight_decay',
      displayValue: String(weightDecayValue.value),
      controlValue: typeof weightDecayValue.value === 'number' ? weightDecayValue.value : undefined
    }
  }

  return overrides
}


function buildDuplicatePreset(preset: TrainingPresetFile): TrainingPresetFile {
  const now = new Date().toISOString()

  return createTrainingPreset({
    ...preset,
    id: `${preset.id}-copy-${Date.now()}`,
    name: `${preset.name} Copy`,
    builtIn: false,
    readOnly: false,
    visible: true,
    createdAt: now,
    updatedAt: now
  })
}

function serializePresetEditorSession(session: PresetEditorSession): string {
  return JSON.stringify({
    preset: session.preset,
    dataJson: session.dataJson,
    modelJson: session.modelJson,
    learningJson: session.learningJson,
    editorMode: session.editorMode,
    importJson: session.importJson
  })
}

function buildPresetExportValue(
  session: PresetEditorSession
): TrainingPresetFile {
  return normalizeTrainingPreset({
    ...session.preset,
    expert: {
      data: parseOptionalJsonBlock('Data block', session.dataJson),
      model: parseOptionalJsonBlock('Model block', session.modelJson),
      learning: parseOptionalJsonBlock('Learning block', session.learningJson)
    }
  })
}

function mergeImportedTechnicalFields(basePreset: TrainingPresetFile, importedPreset: TrainingPresetFile): TrainingPresetFile {
  return normalizeTrainingPreset({
    ...basePreset,
    values: importedPreset.values,
    expert: importedPreset.expert,
    builtIn: false,
    readOnly: false,
    visible: true
  })
}

function prettyJson(value: Record<string, unknown> | undefined): string {
  return value ? JSON.stringify(value, null, 2) : ''
}

function formatJsonString(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return JSON.stringify(JSON.parse(trimmed), null, 2)
}

function extractJsonErrorLocation(rawJson: string, message: string): JsonEditorError {
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  if (lineColumnMatch) {
    return {
      message,
      line: Number.parseInt(lineColumnMatch[1], 10),
      column: Number.parseInt(lineColumnMatch[2], 10)
    }
  }

  const positionMatch = message.match(/position\s+(\d+)/i)
  if (positionMatch) {
    const position = Number.parseInt(positionMatch[1], 10)
    const safePosition = Number.isFinite(position) ? Math.max(0, Math.min(position, rawJson.length)) : 0
    const before = rawJson.slice(0, safePosition)
    const lines = before.split('\n')
    const line = lines.length
    const column = (lines[lines.length - 1]?.length ?? 0) + 1

    return {
      message,
      line,
      column
    }
  }

  return {
    message,
    line: null,
    column: null
  }
}

function parseJsonInput(rawJson: string): { parsed: unknown | null; error: JsonEditorError | null } {
  const trimmed = rawJson.trim()
  if (!trimmed) {
    return {
      parsed: null,
      error: null
    }
  }

  try {
    return {
      parsed: JSON.parse(trimmed),
      error: null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      parsed: null,
      error: extractJsonErrorLocation(rawJson, message)
    }
  }
}

function validateOptionalJsonField(value: string): JsonValidationState {
  const { parsed, error } = parseJsonInput(value)
  if (error) {
    return {
      error,
      parsed: null
    }
  }

  if (parsed == null) {
    return {
      error: null,
      parsed: null
    }
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: {
        message: 'JSON must be an object.',
        line: 1,
        column: 1
      },
      parsed: null
    }
  }

  return {
    error: null,
    parsed: parsed as Record<string, unknown>
  }
}

function validateImportJson(rawJson: string): ImportValidationState {
  const trimmed = rawJson.trim()
  if (!trimmed) {
    return {
      imported: null,
      error: null
    }
  }

  const parsed = parseJsonInput(rawJson)
  if (parsed.error) {
    return {
      imported: null,
      error: parsed.error
    }
  }

  try {
    return {
      imported: createImportedPreset(trimmed),
      error: null
    }
  } catch (error) {
    return {
      imported: null,
      error: {
        message: error instanceof Error ? error.message : String(error),
        line: null,
        column: null
      }
    }
  }
}

function buildAutoFormatPasteHandler(
  currentValue: string,
  onChange: (value: string) => void
): (event: ClipboardEvent<HTMLTextAreaElement>) => void {
  return (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pastedText = event.clipboardData.getData('text')
    const target = event.currentTarget
    const selectionStart = target.selectionStart ?? currentValue.length
    const selectionEnd = target.selectionEnd ?? currentValue.length
    const nextValue = `${currentValue.slice(0, selectionStart)}${pastedText}${currentValue.slice(selectionEnd)}`
    const parsed = parseJsonInput(nextValue)

    if (parsed.error || parsed.parsed == null) {
      return
    }

    event.preventDefault()
    onChange(JSON.stringify(parsed.parsed, null, 2))
  }
}

function PresetCard({
  preset,
  isExpanded,
  onToggleExpanded,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  onCopyJson
}: PresetCardProps) {
  const isEditable = !preset.builtIn && !preset.readOnly
  const architectureTag = formatPresetArchitectureTag(preset)
  const summary = `${preset.values.modelFamily} / ${preset.values.architectureSize} / ${preset.values.batchSize} batch`
  const ownershipBadge = getPresetOwnershipBadge(preset)
  const packedSubmodelSummary = getPackedSubmodelSummary(preset)

  return (
    <div
      className="job-card queue-card"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (shouldIgnoreCardToggle(event.target)) {
          return
        }

        onToggleExpanded(preset.id)
      }}
      onKeyDown={(event) => handleCardToggleKeyDown(event, () => onToggleExpanded(preset.id))}
    >
      <div className="queue-card-summary">
        <div className="job-info queue-card-main">
          <h4>{preset.name}</h4>
          <div className="queue-card-status-row">
            <span className={`queue-status-badge ${ownershipBadge.className}`}>
              {ownershipBadge.label}
            </span>
            <span className="queue-status-badge queued">
              {architectureTag}
            </span>
            <p className="queue-card-headline">{summary}</p>
          </div>
          <p className="preset-card-description">
            {preset.description.trim() || 'No description yet.'}
          </p>
        </div>

        <div className="job-actions queue-card-actions" data-no-card-toggle="true">
          <button
            type="button"
            className={`btn btn-sm btn-secondary${isExpanded ? ' is-toggled' : ''}`}
            onClick={() => onToggleExpanded(preset.id)}
          >
            {isExpanded ? 'Show Less' : 'Show More'}
          </button>
          {isEditable ? (
            <button type="button" className="btn btn-sm btn-blue" onClick={() => onEdit(preset)}>
              Edit
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-blue" onClick={() => onDuplicate(preset)}>
              Customize
            </button>
          )}
          {isEditable && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => onDuplicate(preset)}>
              Duplicate
            </button>
          )}
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void onExport(preset)}>
            Export
          </button>
          {isEditable && (
            <button type="button" className="btn btn-sm btn-orange" onClick={() => void onDelete(preset)}>
              Delete
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="queue-card-details preset-card-details">
            {/* Core Stats Grid */}
            <div className="queue-details-grid">
              <div className="queue-detail-stat">
                <span className="stat-label">NAM</span>
                <span className="stat-value">{architectureTag}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">Family</span>
                <span className="stat-value">{preset.values.modelFamily}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">Size</span>
                <span className="stat-value">{formatArchitectureSize(preset.values.architectureSize)}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">Epochs</span>
                <span className="stat-value">{preset.values.epochs}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">Batch</span>
                <span className="stat-value">{preset.values.batchSize}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">LR</span>
                <span className="stat-value">{preset.values.learningRate}</span>
              </div>
              <div className="queue-detail-stat">
                <span className="stat-label">Decay</span>
                <span className="stat-value">{preset.values.learningRateDecay}</span>
              </div>
            </div>

            {/* Technical Details Paths */}
            <div className="queue-details-paths">
              <div className="detail-path-row">
                <span className="path-label">Category:</span>
                <span className="path-value">{formatPresetCategory(preset.category)}</span>
              </div>
              <div className="detail-path-row">
                <span className="path-label">NY (Window):</span>
                <span className="path-value">{preset.values.ny}</span>
              </div>
              <div className="detail-path-row">
                <span className="path-label">Fit MRSTFT:</span>
                <span className="path-value">{preset.values.fitMrstft ? 'Enabled' : 'Disabled'}</span>
              </div>
              {packedSubmodelSummary && (
                <div className="detail-path-row">
                  <span className="path-label">Packed Submodels:</span>
                  <span className="path-value">{packedSubmodelSummary}</span>
                </div>
              )}
              <div className="detail-path-row">
                <span className="path-label">Overrides:</span>
                <span className="path-value">{getExpertOverrideSummary(preset)}</span>
              </div>
              <div className="detail-path-row">
                <span className="path-label">Preset ID:</span>
                <span className="path-value">{preset.id}</span>
              </div>
              
              {preset.author?.name && (
                <div className="detail-path-row">
                  <span className="path-label">Created By:</span>
                  <span className="path-value">{preset.author.name}</span>
                </div>
              )}
              {preset.author?.url && (
                <div className="detail-path-row">
                  <span className="path-label">Website:</span>
                  <span className="path-value">{preset.author.url}</span>
                </div>
              )}
              {preset.origin?.app && (
                <div className="detail-path-row">
                  <span className="path-label">Origin:</span>
                  <span className="path-value">
                    {preset.origin.version ? `${preset.origin.app} ${preset.origin.version}` : preset.origin.app}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="preset-card-footer" data-no-card-toggle="true">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void onCopyJson(preset)}>
              Copy Preset JSON
            </button>
          </div>
        </>
      )}

      <style>{`
        .queue-status-badge.reward {
          background: rgba(68, 24, 92, 0.88);
          border-color: rgba(184, 124, 255, 0.75);
          color: #f2d8ff;
          box-shadow: 0 0 12px rgba(184, 124, 255, 0.22);
        }
      `}</style>
    </div>
  )
}

function PresetEditor({ session, onSessionChange, onSave, onCancel }: PresetEditorProps) {
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImportDiscardConfirmOpen, setIsImportDiscardConfirmOpen] = useState<boolean>(false)
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState<boolean>(false)

  const dataValidation = useMemo<JsonValidationState>(() => validateOptionalJsonField(session.dataJson), [session.dataJson])
  const modelValidation = useMemo<JsonValidationState>(() => validateOptionalJsonField(session.modelJson), [session.modelJson])
  const learningValidation = useMemo<JsonValidationState>(() => validateOptionalJsonField(session.learningJson), [session.learningJson])
  const importValidation = useMemo<ImportValidationState>(() => validateImportJson(session.importJson), [session.importJson])
  const fieldOverrides = useMemo<Record<BasicFieldKey, BasicFieldOverride | null>>(
    () => buildBasicFieldOverrides(
      dataValidation.parsed,
      modelValidation.parsed,
      learningValidation.parsed,
      session.preset
    ),
    [dataValidation.parsed, learningValidation.parsed, modelValidation.parsed, session.preset]
  )
  const isNameValid = session.preset.name.trim().length > 0
  const hasJsonErrors = [dataValidation.error, modelValidation.error, learningValidation.error].some((entry) => entry !== null)
  const importReady = importValidation.imported !== null
  const isDirty = session.initialSnapshot !== serializePresetEditorSession(session)
  const canSave = isDirty && isNameValid && !hasJsonErrors

  useEffect(() => {
    setShowValidationErrors(false)
    setMessage(null)
    setError(null)
  }, [session.title])

  const updateSession = (patch: Partial<PresetEditorSession>): void => {
    onSessionChange({
      ...session,
      ...patch
    })
  }

  const updatePreset = (patch: Partial<TrainingPresetFile>): void => {
    updateSession({
      preset: normalizeTrainingPreset({
        ...session.preset,
        ...patch
      })
    })
  }

  const updatePresetValues = (patch: Partial<TrainingPresetFile['values']>): void => {
    updatePreset({
      values: {
        ...session.preset.values,
        ...patch
      }
    })
  }

  const updateArchitectureVersion = (architectureVersion: NamArchitectureVersion): void => {
    if (architectureVersion === 'a2') {
      updatePresetValues({
        architectureVersion,
        modelFamily: 'PackedWaveNet',
        architectureSize: 'packed',
        fitMrstft: true,
        mrstftWeight: session.preset.values.mrstftWeight > 0 ? session.preset.values.mrstftWeight : 0.0005,
        weightDecay: session.preset.values.weightDecay > 0 ? session.preset.values.weightDecay : 3.17e-7,
        outputNormalizeRmsDb: session.preset.values.outputNormalizeRmsDb ?? -18
      })
      return
    }

    if (architectureVersion === 'a1') {
      updatePresetValues({
        architectureVersion,
        modelFamily: session.preset.values.modelFamily === 'PackedWaveNet' ? 'WaveNet' : session.preset.values.modelFamily,
        architectureSize: session.preset.values.architectureSize === 'packed' ? 'standard' : session.preset.values.architectureSize,
        mrstftWeight: session.preset.values.mrstftWeight > 0 ? session.preset.values.mrstftWeight : 0.0002,
        weightDecay: 0,
        outputNormalizeRmsDb: null
      })
      return
    }

    updatePresetValues({ architectureVersion })
  }

  const updateModelFamily = (modelFamily: ModelFamily): void => {
    if (modelFamily === 'PackedWaveNet') {
      updateArchitectureVersion('a2')
      return
    }

    updatePresetValues({
      architectureVersion: session.preset.values.architectureVersion === 'a2' ? 'a1' : session.preset.values.architectureVersion,
      modelFamily,
      architectureSize: session.preset.values.architectureSize === 'packed' ? 'standard' : session.preset.values.architectureSize,
      outputNormalizeRmsDb: session.preset.values.architectureVersion === 'a2' ? null : session.preset.values.outputNormalizeRmsDb,
      weightDecay: session.preset.values.architectureVersion === 'a2' ? 0 : session.preset.values.weightDecay
    })
  }

  const updateArchitectureSize = (architectureSize: ArchitectureSize): void => {
    if (architectureSize === 'packed') {
      updateArchitectureVersion('a2')
      return
    }

    updatePresetValues({
      architectureVersion: session.preset.values.architectureVersion === 'a2' ? 'a1' : session.preset.values.architectureVersion,
      modelFamily: session.preset.values.modelFamily === 'PackedWaveNet' ? 'WaveNet' : session.preset.values.modelFamily,
      architectureSize,
      outputNormalizeRmsDb: session.preset.values.architectureVersion === 'a2' ? null : session.preset.values.outputNormalizeRmsDb,
      weightDecay: session.preset.values.architectureVersion === 'a2' ? 0 : session.preset.values.weightDecay
    })
  }

  const updatePresetAuthor = (patch: { name?: string; url?: string }): void => {
    updatePreset({
      author: {
        ...session.preset.author,
        ...patch
      }
    })
  }

  const renderInfoButton = (content: string) => (
    <button
      type="button"
      className="field-info-button"
      title={content}
      aria-label={content}
    >
      i
    </button>
  )

  const renderOverrideBadge = (override: BasicFieldOverride | null) => {
    if (!override) {
      return null
    }

    const tooltip = `Controlled by ${override.source}. Effective value: ${override.displayValue}.`

    return (
      <span className="form-lock-badge" title={tooltip} aria-label={tooltip}>
        JSON Override
      </span>
    )
  }

  const handleEditorModeChange = (nextMode: PresetEditorSession['editorMode']): void => {
    if (
      session.editorMode === 'import'
      && nextMode === 'manual'
      && session.importJson.trim().length > 0
    ) {
      setIsImportDiscardConfirmOpen(true)
      return
    }

    updateSession({ editorMode: nextMode })
  }

  const handleCopyJson = async (): Promise<void> => {
    if (hasJsonErrors) {
      setError('Fix the invalid JSON blocks before copying preset JSON.')
      setMessage(null)
      return
    }

    try {
      const exportValue = buildPresetExportValue(session)
      await navigator.clipboard.writeText(JSON.stringify(exportValue, null, 2))
      setMessage('Preset JSON copied to the clipboard.')
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError))
      setMessage(null)
    }
  }

  const handleImportIntoEditor = (): void => {
    if (!importValidation.imported) {
      return
    }

    const nextPreset = mergeImportedTechnicalFields(session.preset, importValidation.imported.preset)
    updateSession({
      preset: nextPreset,
      dataJson: prettyJson(nextPreset.expert.data),
      modelJson: prettyJson(nextPreset.expert.model),
      learningJson: prettyJson(nextPreset.expert.learning),
      importJson: '',
      editorMode: 'manual'
    })
    setMessage(`Imported ${formatImportKind(importValidation.imported.kind)} into the editor. Review the preset metadata, then save when ready.`)
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    if (!isNameValid) {
      setShowValidationErrors(true)
      setError('Preset name is required before saving.')
      setMessage(null)
      return
    }

    if (hasJsonErrors) {
      setShowValidationErrors(true)
      setError('Fix the invalid JSON blocks before saving.')
      setMessage(null)
      return
    }

    try {
      const nextPreset = buildPresetExportValue(session)
      await onSave(nextPreset)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
      setMessage(null)
    }
  }

  const handleAttemptExit = (): void => {
    if (!isDirty) {
      onCancel()
      return
    }

    setIsUnsavedConfirmOpen(true)
  }

  const handleDiscardChanges = (): void => {
    setIsUnsavedConfirmOpen(false)
    onCancel()
  }

  const handleSaveAndExit = async (): Promise<void> => {
    if (!canSave) {
      return
    }

    try {
      const nextPreset = buildPresetExportValue(session)
      await onSave(nextPreset)
      setIsUnsavedConfirmOpen(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
      setMessage(null)
    }
  }

  return (
    <div className="layout-main">
      <div className="panel">
        <div className="panel-header">
          <h3>{session.title}</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {session.editorMode === 'manual' && (
              <button
                type="submit"
                form={PRESET_EDITOR_FORM_ID}
                className={`btn btn-sm ${canSave ? 'btn-green' : 'btn-secondary'}`}
                disabled={!canSave}
              >
                Save Preset
              </button>
            )}
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleAttemptExit}>
              Cancel
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
          Presets own the full training configuration. Jobs only override epochs and latency.
        </p>

        {message && <p style={{ color: 'var(--neon-green)', marginBottom: '12px' }}>{message}</p>}
        {error && <p style={{ color: 'var(--neon-magenta)', marginBottom: '12px' }}>{error}</p>}

        <div className="toggle-group" style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className={`btn btn-sm ${session.editorMode === 'manual' ? 'btn-blue is-toggled' : 'btn-secondary'}`}
            onClick={() => handleEditorModeChange('manual')}
          >
            Manual Editor
          </button>
          <button
            type="button"
            className={`btn btn-sm ${session.editorMode === 'import' ? 'btn-gold is-toggled' : 'btn-secondary'}`}
            onClick={() => handleEditorModeChange('import')}
          >
            Import JSON
          </button>
        </div>

        {session.editorMode === 'manual' ? (
          <form id={PRESET_EDITOR_FORM_ID} onSubmit={(event) => void handleSubmit(event)}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-name">
                    Name {showValidationErrors && !isNameValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
                  </label>
                </div>
                <input
                  id="preset-name"
                  className="form-input"
                  value={session.preset.name}
                  style={showValidationErrors && !isNameValid ? { borderColor: 'var(--neon-magenta)' } : undefined}
                  onChange={(event) => updatePreset({ name: event.target.value })}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-category">Category</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.category)}
                </div>
                <select
                  id="preset-category"
                  className="form-select"
                  value={session.preset.category}
                  onChange={(event) => updatePreset({
                    category: parsePresetCategory(event.target.value, session.preset.category)
                  })}
                >
                  {PRESET_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label" htmlFor="preset-description">Description</label>
              </div>
              <textarea
                id="preset-description"
                className="form-input"
                rows={3}
                value={session.preset.description}
                onChange={(event) => updatePreset({ description: event.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-author-name">Created By</label>
                </div>
                <input
                  id="preset-author-name"
                  className="form-input"
                  value={session.preset.author?.name ?? ''}
                  onChange={(event) => updatePresetAuthor({ name: event.target.value })}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-author-url">Website / Profile</label>
                </div>
                <input
                  id="preset-author-url"
                  className="form-input"
                  value={session.preset.author?.url ?? ''}
                  onChange={(event) => updatePresetAuthor({ url: event.target.value })}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px'
              }}
            >
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-architecture-version">NAM Architecture</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.architectureVersion)}
                </div>
                <select
                  id="preset-architecture-version"
                  className="form-select"
                  value={getStringControlValue(fieldOverrides.architectureVersion, session.preset.values.architectureVersion)}
                  disabled={fieldOverrides.architectureVersion !== null}
                  onChange={(event) => updateArchitectureVersion(
                    parseArchitectureVersion(event.target.value, session.preset.values.architectureVersion)
                  )}
                >
                  {ARCHITECTURE_VERSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {renderOverrideBadge(fieldOverrides.architectureVersion)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-model-family">Model Family</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.modelFamily)}
                </div>
                <select
                  id="preset-model-family"
                  className="form-select"
                  value={getStringControlValue(fieldOverrides.modelFamily, session.preset.values.modelFamily)}
                  disabled={fieldOverrides.modelFamily !== null}
                  onChange={(event) => updateModelFamily(
                    parseModelFamily(event.target.value, session.preset.values.modelFamily)
                  )}
                >
                  {MODEL_FAMILY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {renderOverrideBadge(fieldOverrides.modelFamily)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-architecture">Architecture</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.architectureSize)}
                </div>
                <select
                  id="preset-architecture"
                  className="form-select"
                  value={getStringControlValue(fieldOverrides.architectureSize, session.preset.values.architectureSize)}
                  disabled={fieldOverrides.architectureSize !== null}
                  onChange={(event) => updateArchitectureSize(
                    parseArchitectureSize(event.target.value, session.preset.values.architectureSize)
                  )}
                >
                  {ARCHITECTURE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {renderOverrideBadge(fieldOverrides.architectureSize)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-epochs">Default Epochs</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.epochs)}
                </div>
                <input
                  id="preset-epochs"
                  type="number"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.epochs, session.preset.values.epochs)}
                  disabled={fieldOverrides.epochs !== null}
                  onChange={(event) => updatePresetValues({
                    epochs: Math.max(1, parseInt(event.target.value, 10) || session.preset.values.epochs)
                  })}
                />
                {renderOverrideBadge(fieldOverrides.epochs)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-batch-size">Batch Size</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.batchSize)}
                </div>
                <input
                  id="preset-batch-size"
                  type="number"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.batchSize, session.preset.values.batchSize)}
                  disabled={fieldOverrides.batchSize !== null}
                  onChange={(event) => updatePresetValues({
                    batchSize: Math.max(1, parseInt(event.target.value, 10) || session.preset.values.batchSize)
                  })}
                />
                {renderOverrideBadge(fieldOverrides.batchSize)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-learning-rate">Learning Rate</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.learningRate)}
                </div>
                <input
                  id="preset-learning-rate"
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.learningRate, session.preset.values.learningRate)}
                  disabled={fieldOverrides.learningRate !== null}
                  onChange={(event) => updatePresetValues({
                    learningRate: parseFloat(event.target.value) || session.preset.values.learningRate
                  })}
                />
                {renderOverrideBadge(fieldOverrides.learningRate)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-learning-rate-decay">LR Decay</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.learningRateDecay)}
                </div>
                <input
                  id="preset-learning-rate-decay"
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.learningRateDecay, session.preset.values.learningRateDecay)}
                  disabled={fieldOverrides.learningRateDecay !== null}
                  onChange={(event) => updatePresetValues({
                    learningRateDecay: parseFloat(event.target.value) || session.preset.values.learningRateDecay
                  })}
                />
                {renderOverrideBadge(fieldOverrides.learningRateDecay)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-ny">NY</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.ny)}
                </div>
                <input
                  id="preset-ny"
                  type="number"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.ny, session.preset.values.ny)}
                  disabled={fieldOverrides.ny !== null}
                  onChange={(event) => updatePresetValues({
                    ny: Math.max(1, parseInt(event.target.value, 10) || session.preset.values.ny)
                  })}
                />
                {renderOverrideBadge(fieldOverrides.ny)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-fit-mrstft">Fit MRSTFT</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.fitMrstft)}
                </div>
                <label className="form-label" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: 0 }}>
                  <input
                    id="preset-fit-mrstft"
                    type="checkbox"
                    checked={getBooleanControlValue(fieldOverrides.fitMrstft, session.preset.values.fitMrstft)}
                    disabled={fieldOverrides.fitMrstft !== null}
                    onChange={(event) => updatePresetValues({
                      fitMrstft: event.target.checked
                    })}
                  />
                  Include MRSTFT loss
                </label>
                {renderOverrideBadge(fieldOverrides.fitMrstft)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-mrstft-weight">MRSTFT Weight</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.mrstftWeight)}
                </div>
                <input
                  id="preset-mrstft-weight"
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.mrstftWeight, session.preset.values.mrstftWeight)}
                  disabled={fieldOverrides.mrstftWeight !== null}
                  onChange={(event) => updatePresetValues({
                    mrstftWeight: Math.max(0, parseFloat(event.target.value) || 0),
                    fitMrstft: (parseFloat(event.target.value) || 0) > 0
                  })}
                />
                {renderOverrideBadge(fieldOverrides.mrstftWeight)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-weight-decay">Weight Decay</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.weightDecay)}
                </div>
                <input
                  id="preset-weight-decay"
                  type="number"
                  step="0.0000001"
                  className="form-input"
                  value={getNumberControlValue(fieldOverrides.weightDecay, session.preset.values.weightDecay)}
                  disabled={fieldOverrides.weightDecay !== null}
                  onChange={(event) => updatePresetValues({
                    weightDecay: Math.max(0, parseFloat(event.target.value) || 0)
                  })}
                />
                {renderOverrideBadge(fieldOverrides.weightDecay)}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="preset-output-normalize">Output Normalize RMS dB</label>
                  {renderInfoButton(BASIC_FIELD_HELP_TEXT.outputNormalizeRmsDb)}
                </div>
                <input
                  id="preset-output-normalize"
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={getOptionalNumberControlValue(fieldOverrides.outputNormalizeRmsDb, session.preset.values.outputNormalizeRmsDb)}
                  disabled={fieldOverrides.outputNormalizeRmsDb !== null}
                  placeholder="Disabled"
                  onChange={(event) => {
                    const parsed = parseFloat(event.target.value)
                    updatePresetValues({
                      outputNormalizeRmsDb: event.target.value.trim() === '' || !Number.isFinite(parsed)
                        ? null
                        : parsed
                    })
                  }}
                />
                {renderOverrideBadge(fieldOverrides.outputNormalizeRmsDb)}
              </div>
            </div>

            <div style={{ borderTop: '2px solid var(--border-dim)', marginTop: '16px', paddingTop: '16px' }}>
              <h4 style={{ color: 'var(--neon-cyan)', marginBottom: '8px' }}>Expert Overrides</h4>
              <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginBottom: '12px' }}>
                These JSON blocks merge on top of the generated `data.json`, `model.json`, and `learning.json`. Hover the `JSON Override` badge on any locked field to see exactly what is controlling it.
              </p>

              <div style={{ display: 'grid', gap: '12px' }}>
                <JsonCodeEditor
                  id="preset-data-json"
                  label="Data JSON"
                  value={session.dataJson}
                  onChange={(value) => updateSession({ dataJson: value })}
                  error={dataValidation.error}
                  helperText="Optional override for the generated data config."
                  minHeight={220}
                  onFormat={() => updateSession({ dataJson: formatJsonString(session.dataJson) })}
                  onPaste={buildAutoFormatPasteHandler(session.dataJson, (value) => updateSession({ dataJson: value }))}
                />

                <JsonCodeEditor
                  id="preset-model-json"
                  label="Model JSON"
                  value={session.modelJson}
                  onChange={(value) => updateSession({ modelJson: value })}
                  error={modelValidation.error}
                  helperText="Optional override for the generated model config."
                  minHeight={260}
                  onFormat={() => updateSession({ modelJson: formatJsonString(session.modelJson) })}
                  onPaste={buildAutoFormatPasteHandler(session.modelJson, (value) => updateSession({ modelJson: value }))}
                />

                <JsonCodeEditor
                  id="preset-learning-json"
                  label="Learning JSON"
                  value={session.learningJson}
                  onChange={(value) => updateSession({ learningJson: value })}
                  error={learningValidation.error}
                  helperText="Optional override for the generated learning config."
                  minHeight={220}
                  onFormat={() => updateSession({ learningJson: formatJsonString(session.learningJson) })}
                  onPaste={buildAutoFormatPasteHandler(session.learningJson, (value) => updateSession({ learningJson: value }))}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="submit" className={`btn ${canSave ? 'btn-green' : 'btn-secondary'}`} disabled={!canSave}>
                Save Preset
              </button>
              <button type="button" className="btn btn-secondary" disabled={hasJsonErrors} onClick={() => void handleCopyJson()}>
                Copy Preset JSON
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleAttemptExit}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ color: 'var(--text-steel)', marginBottom: '12px' }}>
              Paste a full preset, raw `data` / `model` / `learning` config object, or a WaveNet/LSTM model snippet. Imported JSON only updates the technical training settings. Name, category, and description stay in the manual editor.
            </p>

            <JsonCodeEditor
              id="import-preset-json"
              label="Raw JSON"
              value={session.importJson}
              onChange={(value) => updateSession({ importJson: value })}
              error={importValidation.error}
              helperText="Valid pasted JSON is automatically pretty-formatted and syntax-colored."
              minHeight={360}
              onFormat={() => updateSession({ importJson: formatJsonString(session.importJson) })}
              onPaste={buildAutoFormatPasteHandler(session.importJson, (value) => updateSession({ importJson: value }))}
            />

            {!session.importJson.trim() ? (
              <p style={{ color: 'var(--text-steel)', marginBottom: '12px', fontSize: '13px' }}>
                Paste JSON to validate it automatically.
              </p>
            ) : importValidation.error ? (
              <p style={{ color: 'var(--neon-magenta)', marginBottom: '12px', fontSize: '13px' }}>
                {importValidation.error.message}
              </p>
            ) : (
              <p style={{ color: 'var(--neon-green)', marginBottom: '12px', fontSize: '13px' }}>
                Valid {formatImportKind(importValidation.imported?.kind ?? 'full-preset')} detected. Import is ready.
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${importReady ? 'btn-green' : 'btn-secondary'}`}
                disabled={!importReady}
                onClick={handleImportIntoEditor}
              >
                Import Into Editor
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleEditorModeChange('manual')}>
                Back to Manual
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={isImportDiscardConfirmOpen}
        title="Discard Imported JSON?"
        message="This imported JSON has not been applied to the preset editor yet. If you leave this screen now, the pasted import JSON will be discarded."
        confirmLabel="Discard Import"
        alternateLabel={importReady ? 'Import Into Editor' : undefined}
        alternateClassName="btn btn-green"
        onConfirm={() => {
          updateSession({
            editorMode: 'manual',
            importJson: ''
          })
          setIsImportDiscardConfirmOpen(false)
        }}
        onAlternate={() => {
          handleImportIntoEditor()
          setIsImportDiscardConfirmOpen(false)
        }}
        onCancel={() => setIsImportDiscardConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={isUnsavedConfirmOpen}
        title="Discard Unsaved Preset Changes?"
        message="This preset has unsaved edits. Save it now, keep editing, or discard your changes."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        alternateLabel={canSave ? 'Save Preset' : undefined}
        alternateClassName="btn btn-green"
        onConfirm={handleDiscardChanges}
        onAlternate={() => void handleSaveAndExit()}
        onCancel={() => setIsUnsavedConfirmOpen(false)}
      />
    </div>
  )
}

export default function Presets() {
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const loadPresets = useAppStore((state) => state.loadPresets)
  const presetEditorSession = useAppStore((state) => state.presetEditorSession)
  const setPresetEditorSession = useAppStore((state) => state.setPresetEditorSession)
  const clearPresetEditorSession = useAppStore((state) => state.clearPresetEditorSession)
  const [expandedPresets, setExpandedPresets] = useState<Record<string, boolean>>({})
  const [pendingDeletePreset, setPendingDeletePreset] = useState<TrainingPresetFile | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  const visiblePresets = useMemo<TrainingPresetFile[]>(
    () => presets.filter((preset) => preset.visible),
    [presets]
  )

  const toggleExpanded = (presetId: string): void => {
    setExpandedPresets((current) => ({
      ...current,
      [presetId]: !current[presetId]
    }))
  }

  const handleCreateNew = (): void => {
    setPresetEditorSession(buildPresetEditorSession('New Preset', buildNewPresetDraft(settings)))
    setMessage(null)
    setError(null)
  }

  const handleEdit = (preset: TrainingPresetFile): void => {
    setPresetEditorSession(buildPresetEditorSession('Edit Preset', preset))
    setMessage(null)
    setError(null)
  }

  const handleDuplicate = (preset: TrainingPresetFile): void => {
    setPresetEditorSession(buildPresetEditorSession(
      preset.builtIn || preset.readOnly ? 'Customize Preset' : 'Duplicate Preset',
      buildDuplicatePreset(preset)
    ))
    setMessage(null)
    setError(null)
  }

  const handleSave = async (preset: TrainingPresetFile): Promise<void> => {
    const saved = normalizeTrainingPreset(await window.namBot.presets.save(preset))
    await loadPresets()
    clearPresetEditorSession()
    setMessage(`Saved preset "${saved.name}".`)
    setError(null)
  }

  const handleDelete = async (preset: TrainingPresetFile): Promise<void> => {
    try {
      await window.namBot.presets.delete(preset.id)
      await loadPresets()
      setExpandedPresets((current) => {
        const nextState = { ...current }
        delete nextState[preset.id]
        return nextState
      })
      setPendingDeletePreset(null)
      setMessage(`Deleted preset "${preset.name}".`)
      setError(null)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
      setMessage(null)
    }
  }

  const handleCopyJson = async (preset: TrainingPresetFile): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(normalizeTrainingPreset(preset), null, 2))
      setMessage(`Copied preset JSON for "${preset.name}".`)
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError))
      setMessage(null)
    }
  }

  const handleExport = async (preset: TrainingPresetFile): Promise<void> => {
    try {
      const exportPath = await window.namBot.presets.exportPreset(normalizeTrainingPreset(preset))
      if (!exportPath) {
        return
      }

      setMessage(`Exported preset "${preset.name}" to ${exportPath}.`)
      setError(null)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
      setMessage(null)
    }
  }

  const handleImportPreset = async (): Promise<void> => {
    try {
      const imported = await window.namBot.presets.importPreset()
      if (!imported) {
        return
      }

      const importedPreset = normalizeTrainingPreset(imported)
      await loadPresets()
      setExpandedPresets((current) => ({
        ...current,
        [importedPreset.id]: true
      }))
      setMessage(`Imported preset "${importedPreset.name}".`)
      setError(null)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
      setMessage(null)
    }
  }

  if (presetEditorSession) {
    return (
      <PresetEditor
        session={presetEditorSession}
        onSessionChange={setPresetEditorSession}
        onSave={handleSave}
        onCancel={clearPresetEditorSession}
      />
    )
  }

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Presets</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => void handleImportPreset()}>
              Import Preset
            </button>
            <button type="button" className="btn btn-green" onClick={handleCreateNew}>
              New Preset
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--text-steel)' }}>
          Browse your preset library here. Open a card for deeper technical details, or launch the editor only when you need to create or change a preset.
        </p>

        {message && <p style={{ color: 'var(--neon-green)', marginTop: '10px' }}>{message}</p>}
        {error && <p style={{ color: 'var(--neon-magenta)', marginTop: '10px' }}>{error}</p>}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Library ({visiblePresets.length})</h3>
        </div>

        {visiblePresets.length === 0 ? (
          <p style={{ color: 'var(--text-steel)' }}>
            No presets are available yet. Click `New Preset` to create one.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {visiblePresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isExpanded={expandedPresets[preset.id] === true}
                onToggleExpanded={toggleExpanded}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={async (nextPreset) => {
                  setPendingDeletePreset(nextPreset)
                }}
                onExport={handleExport}
                onCopyJson={handleCopyJson}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDeletePreset !== null}
        title="Delete Preset?"
        message={pendingDeletePreset ? `Delete preset "${pendingDeletePreset.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDeletePreset) {
            return
          }

          void handleDelete(pendingDeletePreset)
        }}
        onCancel={() => setPendingDeletePreset(null)}
      />
    </div>
  )
}
