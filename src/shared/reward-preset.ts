export const EPOCH_RUNNER_REWARD_PRESET_ID = 'epoch-runner-reward-demonic'

/**
 * Releases through 0.7.0 saved every reward under this ID: Converged Night Run, an A1
 * WaveNet preset, before 0.7.0, and Demonic Convergence in 0.7.0. Existing copies keep it.
 */
export const LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID = 'epoch-runner-reward'

export function isEpochRunnerRewardPresetId(presetId: string): boolean {
  return presetId === EPOCH_RUNNER_REWARD_PRESET_ID || presetId === LEGACY_EPOCH_RUNNER_REWARD_PRESET_ID
}
