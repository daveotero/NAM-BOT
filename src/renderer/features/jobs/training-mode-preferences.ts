import { normalizeStoppingPolicy, type TrainingStoppingPolicy } from '../../../shared/convergence'

export const LAST_TRAINING_MODE_KEY = 'nam-bot:last-training-mode'
export function getStoredStoppingPreference(): TrainingStoppingPolicy {
  try { return normalizeStoppingPolicy(JSON.parse(window.localStorage.getItem(LAST_TRAINING_MODE_KEY) ?? 'null')) }
  catch { return normalizeStoppingPolicy(null) }
}
export function persistStoppingPreference(policy: TrainingStoppingPolicy): void {
  window.localStorage.setItem(LAST_TRAINING_MODE_KEY, JSON.stringify(policy))
}
