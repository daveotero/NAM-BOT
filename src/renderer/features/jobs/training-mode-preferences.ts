import { DEFAULT_CONVERGENCE_MAX_EPOCHS, normalizeStoppingPolicy, normalizeStoppingPolicyForTraining, type TrainingStoppingPolicy } from '../../../shared/convergence'

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
  try {
    const policy = normalizeStoppingPolicy(JSON.parse(window.localStorage.getItem(LAST_TRAINING_MODE_KEY) ?? 'null'))
    return policy.mode === 'convergence' ? { ...policy, maxEpochs: getStoredConvergenceMaxEpochs() } : policy
  }
  catch { return normalizeStoppingPolicy(null) }
}
export function persistStoppingPreference(policy: TrainingStoppingPolicy): void {
  const normalized = normalizeStoppingPolicyForTraining(policy)
  if (normalized.mode === 'convergence' && normalized.maxEpochs != null) {
    window.localStorage.setItem(LAST_CONVERGENCE_MAX_EPOCHS_KEY, String(normalized.maxEpochs))
  }
  window.localStorage.setItem(LAST_TRAINING_MODE_KEY, JSON.stringify(normalized))
}
