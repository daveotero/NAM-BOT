import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import {
  JobSpec,
  JobPackedSubmodelSelection,
  TrainingPresetFile,
  buildA2PackedModelConfig,
  buildLstmConfig,
  buildWaveNetConfig,
  isA2TrainingPreset
} from '../types/jobs'

export interface GeneratedConfigPaths {
  dataConfig: string
  modelConfig: string
  learningConfig: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value)
      continue
    }
    result[key] = value
  }

  return result
}

function mergeModelConfig(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (key === 'net' && isRecord(value)) {
      result.net = value
      continue
    }
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value)
      continue
    }
    result[key] = value
  }

  return result
}

function isSelectedPackedSubmodel(
  submodel: Record<string, unknown>,
  submodelIndex: number,
  selections: JobPackedSubmodelSelection[]
): boolean {
  const submodelName = typeof submodel.name === 'string' ? submodel.name : null
  return selections.some((selection) => selection.submodelIndex === submodelIndex && (
    selection.submodelName == null
    || submodelName == null
    || selection.submodelName === submodelName
  ))
}

function filterPackedSubmodelsForJob(modelConfig: Record<string, unknown>, job: JobSpec): Record<string, unknown> {
  const selections = job.trainingOverrides.packedSubmodels
  if (!selections || selections.length === 0) {
    return modelConfig
  }

  const net = isRecord(modelConfig.net) ? modelConfig.net : null
  const netConfig = isRecord(net?.config) ? net.config : null
  const submodels = Array.isArray(netConfig?.submodels) ? netConfig.submodels : null
  if (!net || net.name !== 'PackedWaveNet' || !netConfig || !submodels) {
    return modelConfig
  }

  const selectedSubmodels = submodels.filter((submodel, submodelIndex) => (
    isRecord(submodel) && isSelectedPackedSubmodel(submodel, submodelIndex, selections)
  ))

  if (selectedSubmodels.length === 0) {
    throw new Error('At least one selected packed submodel must match the selected preset.')
  }

  const nextNetConfig: Record<string, unknown> = {
    ...netConfig,
    submodels: selectedSubmodels
  }
  const exportConfig = isRecord(netConfig.export) ? netConfig.export : null
  if (exportConfig && Array.isArray(exportConfig.container_max_values)) {
    const selectedMaxValues = exportConfig.container_max_values.filter((_value, submodelIndex) => (
      isRecord(submodels[submodelIndex]) && isSelectedPackedSubmodel(submodels[submodelIndex], submodelIndex, selections)
    ))
    nextNetConfig.export = {
      ...exportConfig,
      container_max_values: selectedMaxValues
    }
  }

  return {
    ...modelConfig,
    net: {
      ...net,
      config: nextNetConfig
    }
  }
}

function buildBaseDataConfig(job: JobSpec, preset: TrainingPresetFile): Record<string, unknown> {
  const validationHoldoutSeconds = job.inputAudioIsDefault ? 9.0 : 10.0
  const commonConfig: Record<string, unknown> = {
    x_path: job.inputAudioPath,
    y_path: job.outputAudioPath,
    delay: job.trainingOverrides.latencySamples ?? 0,
    allow_unequal_lengths: true
  }

  if (!job.inputAudioIsDefault) {
    commonConfig.require_input_pre_silence = null
  }

  const dataConfig: Record<string, unknown> = {
    train: {
      start_seconds: null,
      stop_seconds: -validationHoldoutSeconds,
      ny: preset.values.ny
    },
    validation: {
      start_seconds: -validationHoldoutSeconds,
      stop_seconds: null,
      ny: null
    },
    common: commonConfig
  }

  if (isA2TrainingPreset(preset) && preset.values.outputNormalizeRmsDb != null) {
    dataConfig.joint = [
      {
        name: 'nam.data.normalize_joint_dataset_output',
        kwargs: {
          level_rms_dbfs: preset.values.outputNormalizeRmsDb
        }
      }
    ]
  }

  return dataConfig
}

function buildBaseModelConfig(preset: TrainingPresetFile): Record<string, unknown> {
  const schedulerGamma = Math.max(0, 1 - preset.values.learningRateDecay)

  if (isA2TrainingPreset(preset)) {
    return buildA2PackedModelConfig(preset.values)
  }

  if (preset.values.modelFamily === 'LSTM') {
    const loss: Record<string, unknown> = {
      val_loss: 'mse',
      mask_first: 4096,
      pre_emph_weight: 1.0,
      pre_emph_coef: 0.85
    }

    if (preset.values.fitMrstft && preset.values.mrstftWeight > 0) {
      loss.pre_emph_mrstft_weight = preset.values.mrstftWeight
      loss.pre_emph_mrstft_coef = 0.85
    }

    return {
      net: {
        name: 'LSTM',
        config: buildLstmConfig(preset.values.architectureSize)
      },
      loss,
      optimizer: {
        lr: preset.values.learningRate
      },
      lr_scheduler: {
        class: 'ExponentialLR',
        kwargs: {
          gamma: schedulerGamma
        }
      }
    }
  }

  const loss: Record<string, unknown> = {
    val_loss: 'esr'
  }

  if (preset.values.fitMrstft && preset.values.mrstftWeight > 0) {
    loss.pre_emph_mrstft_weight = preset.values.mrstftWeight
    loss.pre_emph_mrstft_coef = 0.85
  }

  return {
    net: {
      name: 'WaveNet',
      config: buildWaveNetConfig(preset.values.architectureSize)
    },
    loss,
    optimizer: {
      lr: preset.values.learningRate,
      ...(preset.values.weightDecay > 0 ? { weight_decay: preset.values.weightDecay } : {})
    },
    lr_scheduler: {
      class: 'ExponentialLR',
      kwargs: {
        gamma: schedulerGamma
      }
    }
  }
}

function buildBaseLearningConfig(job: JobSpec, preset: TrainingPresetFile): Record<string, unknown> {
  return {
    train_dataloader: {
      batch_size: preset.values.batchSize,
      shuffle: true,
      pin_memory: true,
      drop_last: true,
      num_workers: 0
    },
    val_dataloader: {},
    trainer: {
      accelerator: 'auto',
      devices: 1,
      max_epochs: job.trainingOverrides.epochs ?? preset.values.epochs
    },
    trainer_fit_kwargs: {}
  }
}

export function buildJobConfigs(
  job: JobSpec,
  workspaceDir: string,
  preset: TrainingPresetFile
): GeneratedConfigPaths {
  log.info('Building job configs for:', job.id, 'with preset:', preset.id)

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true })
  }

  const dataConfig = preset.expert.data && isRecord(preset.expert.data)
    ? deepMerge(buildBaseDataConfig(job, preset), preset.expert.data)
    : buildBaseDataConfig(job, preset)

  const modelConfigBase = preset.expert.model && isRecord(preset.expert.model)
    ? mergeModelConfig(buildBaseModelConfig(preset), preset.expert.model)
    : buildBaseModelConfig(preset)
  const modelConfig = filterPackedSubmodelsForJob(modelConfigBase, job)

  const learningConfig = preset.expert.learning && isRecord(preset.expert.learning)
    ? deepMerge(buildBaseLearningConfig(job, preset), preset.expert.learning)
    : buildBaseLearningConfig(job, preset)

  const dataConfigPath = join(workspaceDir, 'data.json')
  const modelConfigPath = join(workspaceDir, 'model.json')
  const learningConfigPath = join(workspaceDir, 'learning.json')

  writeFileSync(dataConfigPath, JSON.stringify(dataConfig, null, 2), 'utf-8')
  writeFileSync(modelConfigPath, JSON.stringify(modelConfig, null, 2), 'utf-8')
  writeFileSync(learningConfigPath, JSON.stringify(learningConfig, null, 2), 'utf-8')

  log.info('Configs written:', { dataConfigPath, modelConfigPath, learningConfigPath })

  return {
    dataConfig: dataConfigPath,
    modelConfig: modelConfigPath,
    learningConfig: learningConfigPath
  }
}

export function validateJobSpec(job: JobSpec): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!job.inputAudioPath) {
    errors.push('Input audio path is required')
  }

  if (!job.outputAudioPath) {
    errors.push('Output audio path is required')
  }

  if (!job.outputRootDir) {
    errors.push('Output root directory is required')
  }

  if ((job.trainingOverrides.epochs ?? 0) < 1) {
    errors.push('Epochs must be at least 1')
  }

  const latencyMode = job.trainingOverrides.latencyMode ?? 'manual'
  if (latencyMode !== 'manual' && latencyMode !== 'auto') {
    errors.push('Latency mode must be manual or auto')
  }

  if (!Number.isFinite(job.trainingOverrides.latencySamples ?? 0)) {
    errors.push('Latency must be a valid number')
  }

  if (job.trainingOverrides.packedSubmodels && job.trainingOverrides.packedSubmodels.length < 1) {
    errors.push('At least one packed submodel must be selected')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
