/** Fixed, versioned rules shared by every installation. Never fitted to local history. */
export const CONVERGENCE_VERSION = 1
export type ConvergenceLevel = 'fast' | 'balanced' | 'thorough'
export const CONVERGENCE_LEVELS: readonly ConvergenceLevel[] = ['fast', 'balanced', 'thorough']
export const CONVERGENCE_LABELS: Record<ConvergenceLevel, string> = {
  fast: 'Fast', balanced: 'Balanced', thorough: 'Thorough'
}
export interface ConvergenceRule {
  minimum: number
  window: number
  tolerance: number
}
export const CONVERGENCE_RULES: Readonly<Record<ConvergenceLevel, ConvergenceRule>> = {
  fast: { minimum: 100, window: 50, tolerance: 0.02 },
  balanced: { minimum: 150, window: 75, tolerance: 0.01 },
  thorough: { minimum: 300, window: 150, tolerance: 0.0025 }
}
export const CONVERGENCE_CONFIRMATIONS = 5

export interface TrainingStoppingPolicy {
  mode: 'fixed' | 'convergence'
  level: ConvergenceLevel
  /** Optional safety cap; fixed mode uses the original epoch target. */
  maxEpochs: number | null
}
export interface ConvergenceLevelStatus {
  level: ConvergenceLevel
  confirmations: number
  qualified: boolean
  firstReachedEpoch: number | null
  waitingModels: string[]
}
export type TrainingCompletionReason = 'convergence' | 'epoch_limit' | 'safety_cap' | 'manual' | 'trainer'
export interface ConvergenceStatus {
  version: number
  policy: TrainingStoppingPolicy
  originalEpochLimit: number | null
  epoch: number
  validatedEpochs: number
  phase: 'warming' | 'monitoring' | 'unavailable' | 'stopping' | 'finished'
  levels: ConvergenceLevelStatus[]
  achievedLevel: ConvergenceLevel | null
  completionReason: TrainingCompletionReason | null
  message: string | null
  changes: Array<{ epoch: number; policy: TrainingStoppingPolicy }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function isConvergenceLevel(value: unknown): value is ConvergenceLevel {
  return value === 'fast' || value === 'balanced' || value === 'thorough'
}
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
export function isTrainingStoppingPolicy(value: unknown): value is TrainingStoppingPolicy {
  return isRecord(value) && (value.mode === 'fixed' || value.mode === 'convergence')
    && isConvergenceLevel(value.level)
    && (value.maxEpochs === null || (isCount(value.maxEpochs) && value.maxEpochs > 0))
    && (value.mode !== 'fixed' || value.maxEpochs === null)
}
export function normalizeStoppingPolicy(value: unknown): TrainingStoppingPolicy {
  if (isTrainingStoppingPolicy(value)) return { mode: value.mode, level: value.level, maxEpochs: value.maxEpochs }
  return { mode: 'fixed', level: 'balanced', maxEpochs: null }
}
export function normalizeConvergenceStatus(value: unknown): ConvergenceStatus | undefined {
  if (!isRecord(value) || !isCount(value.version) || !isTrainingStoppingPolicy(value.policy)
    || !isCount(value.epoch) || !isCount(value.validatedEpochs)
    || !(value.originalEpochLimit === null || (isCount(value.originalEpochLimit) && value.originalEpochLimit > 0))
    || !['warming', 'monitoring', 'unavailable', 'stopping', 'finished'].includes(String(value.phase))
    || !Array.isArray(value.levels) || !Array.isArray(value.changes)) return undefined
  const levels: ConvergenceLevelStatus[] = []
  for (const entry of value.levels) {
    if (!isRecord(entry) || !isConvergenceLevel(entry.level) || !isCount(entry.confirmations)
      || typeof entry.qualified !== 'boolean' || !(entry.firstReachedEpoch === null || isCount(entry.firstReachedEpoch))
      || !Array.isArray(entry.waitingModels) || !entry.waitingModels.every((name: unknown) => typeof name === 'string')
      || levels.some(level => level.level === entry.level)) return undefined
    levels.push({ level: entry.level, confirmations: entry.confirmations, qualified: entry.qualified,
      firstReachedEpoch: entry.firstReachedEpoch, waitingModels: entry.waitingModels })
  }
  if (levels.length !== CONVERGENCE_LEVELS.length) return undefined
  const changes: ConvergenceStatus['changes'] = []
  for (const change of value.changes) {
    if (!isRecord(change) || !isCount(change.epoch) || !isTrainingStoppingPolicy(change.policy)) return undefined
    changes.push({ epoch: change.epoch, policy: normalizeStoppingPolicy(change.policy) })
  }
  const phase = value.phase
  if (phase !== 'warming' && phase !== 'monitoring' && phase !== 'unavailable' && phase !== 'stopping' && phase !== 'finished') return undefined
  const reason = value.completionReason
  if (reason !== null && reason !== 'convergence' && reason !== 'epoch_limit' && reason !== 'safety_cap' && reason !== 'manual' && reason !== 'trainer') return undefined
  return { version: value.version, policy: normalizeStoppingPolicy(value.policy), originalEpochLimit: value.originalEpochLimit,
    epoch: value.epoch, validatedEpochs: value.validatedEpochs, phase, levels,
    achievedLevel: isConvergenceLevel(value.achievedLevel) ? value.achievedLevel : null,
    completionReason: reason, message: typeof value.message === 'string' ? value.message : null, changes }
}

export function convergenceCompletionLabel(status: ConvergenceStatus): string {
  switch (status.completionReason) {
    case 'convergence': return `Auto-stopped · ${CONVERGENCE_LABELS[status.policy.level]}`
    case 'safety_cap': return 'Safety cap reached'
    case 'epoch_limit': return 'Epoch target reached'
    case 'manual': return 'Finished manually'
    default: return 'Training complete'
  }
}
