import { DEFAULT_CONVERGENCE_MAX_EPOCHS, isTrainingStoppingPolicy, normalizeStoppingPolicy, normalizeStoppingPolicyForTraining, type TrainingStoppingPolicy } from '../../../shared/convergence'
import type { TrainingPresetFile } from '../../../shared/training'

export const LAST_TRAINING_MODE_KEY = 'nam-bot:last-training-mode'
export const LAST_CONVERGENCE_MAX_EPOCHS_KEY = 'nam-bot:last-convergence-max-epochs'

export function getStoredConvergenceMaxEpochs(): number {
  try {
    const saved = Number(window.localStorage.getItem(LAST_CONVERGENCE_MAX_EPOCHS_KEY))
    if (Number.isSafeInteger(saved) && saved > 0) return saved
    const previous = normalizeStoppingPolicy(JSON.parse(window.localStorage.getItem(LAST_TRAINING_MODE_KEY) ?? 'null'))
    return previous.maxEpochs ?? DEFAULT_CONVERGENCE_MAX_EPOCHS
  } catch { return DEFAULT_CONVERGENCE_MAX_EPOCHS }
}

export function getStoredStoppingPreference(): TrainingStoppingPolicy {
  let policy: TrainingStoppingPolicy = { mode: 'convergence', level: 'balanced', maxEpochs: DEFAULT_CONVERGENCE_MAX_EPOCHS }
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(LAST_TRAINING_MODE_KEY) ?? 'null')
    if (isTrainingStoppingPolicy(stored)) policy = stored
  } catch { /* A missing or invalid preference uses the new-job default. */ }
  return policy.mode === 'convergence' ? { ...policy, maxEpochs: getStoredConvergenceMaxEpochs() } : { ...policy }
}
export function getDefaultStoppingPolicy(preset?: TrainingPresetFile): TrainingStoppingPolicy {
  return normalizeStoppingPolicyForTraining(preset?.stopping ?? getStoredStoppingPreference())
}
export function persistStoppingPreference(policy: TrainingStoppingPolicy): void {
  const normalized = normalizeStoppingPolicyForTraining(policy)
  if (normalized.mode === 'convergence' && normalized.maxEpochs != null) {
    window.localStorage.setItem(LAST_CONVERGENCE_MAX_EPOCHS_KEY, String(normalized.maxEpochs))
  }
  window.localStorage.setItem(LAST_TRAINING_MODE_KEY, JSON.stringify(normalized))
}
