import {
  EPOCH_RUNNER_REWARD_PRESET_ID,
  LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID,
  isEpochRunnerRewardPresetId
} from '../../../shared/reward-preset'
import { buildA2PackedNetConfig, createTrainingPreset, getPresetArchitectureVersion, type TrainingPresetFile } from '../../../shared/training'

export const EPOCH_RUNNER_COMMAND = 'epochrunner.exe'
export const EPOCH_RUNNER_COMMAND_ALIAS = 'epochrunner'
export const EPOCH_RUNNER_REWARD_TAG = 'Epoch Runner Reward'

export function createEpochRunnerRewardPreset(): TrainingPresetFile {
  return createTrainingPreset({
    id: EPOCH_RUNNER_REWARD_PRESET_ID,
    name: 'Demonic Convergence',
    description: 'An after-hours A2 pack with seven submodels spanning 3 to 28 channels. Obsessive auto convergence with a 6,666-epoch safety limit. Extends Ultra 20 with 24- and 28-channel tiers at substantially increased CPU, GPU, memory, and training cost.',
    category: 'quality',
    builtIn: false,
    readOnly: false,
    visible: true,
    stopping: { mode: 'convergence', level: 'thorough', maxEpochs: 6666 },
    values: {
      architectureVersion: 'a2',
      modelFamily: 'PackedWaveNet',
      architectureSize: 'packed',
      epochs: 666,
      batchSize: 16,
      learningRate: 0.004,
      learningRateDecay: 0.006,
      ny: 8192,
      fitMrstft: true,
      mrstftWeight: 0.0005,
      weightDecay: 3.17e-7,
      outputNormalizeRmsDb: -18
    },
    expert: {
      model: {
        net: buildA2PackedNetConfig([3, 8, 12, 16, 20, 24, 28])
      }
    },
    author: {
      name: 'Dave Otero'
    },
    origin: {
      app: 'NAM-BOT',
      version: '0.7.0'
    }
  })
}

/** Any reward preset, including one saved by an earlier release. */
export function isEpochRunnerRewardPreset(preset: TrainingPresetFile): boolean {
  return isEpochRunnerRewardPresetId(preset.id)
}

/**
 * The reward a win currently grants. A 0.7.0 copy of it carries the legacy ID; the older
 * reward under that ID is A1, so it does not count and can be kept alongside.
 */
export function isCurrentEpochRunnerRewardPreset(preset: TrainingPresetFile): boolean {
  return preset.id === EPOCH_RUNNER_REWARD_PRESET_ID
    || (preset.id === LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID && getPresetArchitectureVersion(preset) === 'a2')
}

export function formatPresetNameWithRewardTag(preset: TrainingPresetFile): string {
  if (!isEpochRunnerRewardPreset(preset)) {
    return preset.name
  }

  return `${preset.name} [${EPOCH_RUNNER_REWARD_TAG}]`
}
