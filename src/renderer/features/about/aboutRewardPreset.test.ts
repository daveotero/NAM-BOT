import { describe, expect, it } from 'vitest'

import { EPOCH_RUNNER_REWARD_PRESET_ID, LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID } from '../../../shared/reward-preset'
import { normalizeTrainingPreset } from '../../../shared/training'
import {
  createEpochRunnerRewardPreset,
  formatPresetNameWithRewardTag,
  isCurrentEpochRunnerRewardPreset,
  isEpochRunnerRewardPreset
} from './aboutRewardPreset'

describe('terminal reward presets', () => {
  const current = createEpochRunnerRewardPreset()
  // A 0.7.0 copy of the current reward, saved before it had its own ID.
  const currentUnderLegacyId = normalizeTrainingPreset({ ...current, id: LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID })
  // The reward before 0.7.0, as the library reads its file: an A1 WaveNet recipe under the
  // same legacy ID, saved before presets recorded an architecture version.
  const olderReward = normalizeTrainingPreset({
    id: LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID,
    name: 'Converged Night Run',
    values: { modelFamily: 'WaveNet', architectureSize: 'custom', epochs: 666 },
    expert: { model: { net: { name: 'WaveNet', config: {} } } }
  })

  it('grants the current reward under its own ID', () => {
    expect(current.id).toBe(EPOCH_RUNNER_REWARD_PRESET_ID)
    expect(isCurrentEpochRunnerRewardPreset(current)).toBe(true)
    expect(isCurrentEpochRunnerRewardPreset(currentUnderLegacyId)).toBe(true)
  })

  it('keeps the older reward tagged without counting it as the current one', () => {
    expect(olderReward.values.architectureVersion).toBe('a1')
    expect(isCurrentEpochRunnerRewardPreset(olderReward)).toBe(false)
    expect(isEpochRunnerRewardPreset(olderReward)).toBe(true)
    expect(formatPresetNameWithRewardTag(olderReward)).toBe('Converged Night Run [Epoch Runner Reward]')
    expect(formatPresetNameWithRewardTag(current)).toBe('Demonic Convergence [Epoch Runner Reward]')
  })
})
