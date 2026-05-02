export interface ConfirmedNamTrainingMetadata {
  validationEsr?: number
  manualLatency?: number | null
  trainedEpochs?: number
  presetName?: string
}

export interface NamExportDateMetadata {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

interface BuildUpdatedNamModelMetadataInput {
  currentMetadata: Record<string, unknown>
  metadataPatch: Record<string, unknown>
  confirmedTrainingMetadata: ConfirmedNamTrainingMetadata
  exportDate: NamExportDateMetadata
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasManualLatency(
  value: ConfirmedNamTrainingMetadata
): value is ConfirmedNamTrainingMetadata & { manualLatency: number | null | undefined } {
  return Object.prototype.hasOwnProperty.call(value, 'manualLatency')
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function buildMetadataBase(currentMetadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(currentMetadata)) {
    if (key === 'date' || key === 'training' || key === 'nam_bot') {
      continue
    }
    result[key] = value
  }

  return result
}

function buildOfficialTrainingMetadata(
  currentTraining: Record<string, unknown>,
  confirmedTrainingMetadata: ConfirmedNamTrainingMetadata
): Record<string, unknown> | null {
  const nextTraining: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(currentTraining)) {
    if (key === 'nam_bot') {
      continue
    }
    nextTraining[key] = value
  }

  if (confirmedTrainingMetadata.validationEsr != null) {
    nextTraining.validation_esr = confirmedTrainingMetadata.validationEsr
  }

  if (hasManualLatency(confirmedTrainingMetadata)) {
    const currentData = isRecord(nextTraining.data) ? nextTraining.data : null
    const currentLatency = currentData && isRecord(currentData.latency) ? currentData.latency : null

    if (currentData && currentLatency) {
      nextTraining.data = {
        ...currentData,
        latency: {
          ...currentLatency,
          manual: confirmedTrainingMetadata.manualLatency ?? null
        }
      }
    }
  }

  return Object.keys(nextTraining).length > 0 ? nextTraining : null
}

function buildNamBotMetadata(
  currentMetadata: Record<string, unknown>,
  currentTraining: Record<string, unknown>,
  confirmedTrainingMetadata: ConfirmedNamTrainingMetadata
): Record<string, unknown> | null {
  const legacyNamBotMetadata = isRecord(currentTraining.nam_bot) ? currentTraining.nam_bot : {}
  const currentNamBotMetadata = isRecord(currentMetadata.nam_bot) ? currentMetadata.nam_bot : {}
  const nextNamBotMetadata: Record<string, unknown> = {
    ...legacyNamBotMetadata,
    ...currentNamBotMetadata
  }

  if (isPositiveInteger(confirmedTrainingMetadata.trainedEpochs)) {
    nextNamBotMetadata.trained_epochs = confirmedTrainingMetadata.trainedEpochs
  }

  if (isNonEmptyString(confirmedTrainingMetadata.presetName)) {
    nextNamBotMetadata.preset_name = confirmedTrainingMetadata.presetName
  }

  if (hasManualLatency(confirmedTrainingMetadata)) {
    nextNamBotMetadata.manual_latency_samples = confirmedTrainingMetadata.manualLatency ?? null
  }

  return Object.keys(nextNamBotMetadata).length > 0 ? nextNamBotMetadata : null
}

export function hasNamModelMetadataUpdates(
  metadataPatch: Record<string, unknown>,
  confirmedTrainingMetadata: ConfirmedNamTrainingMetadata
): boolean {
  return Object.keys(metadataPatch).length > 0
    || confirmedTrainingMetadata.validationEsr != null
    || hasManualLatency(confirmedTrainingMetadata)
    || isPositiveInteger(confirmedTrainingMetadata.trainedEpochs)
    || isNonEmptyString(confirmedTrainingMetadata.presetName)
}

export function buildUpdatedNamModelMetadata({
  currentMetadata,
  metadataPatch,
  confirmedTrainingMetadata,
  exportDate
}: BuildUpdatedNamModelMetadataInput): Record<string, unknown> {
  const currentTraining = isRecord(currentMetadata.training) ? currentMetadata.training : {}
  const nextTraining = buildOfficialTrainingMetadata(currentTraining, confirmedTrainingMetadata)
  const nextNamBotMetadata = buildNamBotMetadata(currentMetadata, currentTraining, confirmedTrainingMetadata)

  return {
    ...buildMetadataBase(currentMetadata),
    date: exportDate,
    ...metadataPatch,
    ...(nextTraining ? { training: nextTraining } : {}),
    ...(nextNamBotMetadata ? { nam_bot: nextNamBotMetadata } : {})
  }
}
