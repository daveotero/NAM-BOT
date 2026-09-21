import { describe, expect, it } from 'vitest'
import { CONVERGENCE_LEVELS, normalizeConvergenceStatus, type ConvergenceStatus } from '../../../shared/convergence'
import { getConvergenceProgress } from './convergence-progress'

function status(): ConvergenceStatus {
  return {
    version: 1, policy: { mode: 'convergence', level: 'balanced', maxEpochs: 2000 },
    originalEpochLimit: null, epoch: 200, validatedEpochs: 200, phase: 'monitoring',
    levels: CONVERGENCE_LEVELS.map(level => ({ level, confirmations: 0, qualified: false,
      firstReachedEpoch: null, waitingModels: [], recentImprovement: 0.024, observationCount: 76 })),
    achievedLevel: null, completionReason: null, message: null, changes: []
  }
}

describe('training progress value', () => {
  it('compares the actual measurement with the selected threshold after normalization', () => {
    const normalized = normalizeConvergenceStatus(status())
    expect(normalized).toBeDefined()
    if (!normalized) throw new Error('Missing convergence status')
    expect(getConvergenceProgress(normalized)).toBe('2.40% recent improvement · target <1.00%')
    normalized.levels[1].recentImprovement = 0.010001
    expect(getConvergenceProgress(normalized)).toBe('1.01% recent improvement · target <1.00%')
  })

  it('uses the selected level minimum even while faster levels are already monitoring', () => {
    const value = status()
    value.policy.level = 'thorough'
    value.validatedEpochs = 200
    expect(getConvergenceProgress(value)).toBe('Gathering history · 200/300 validated epochs')
  })

  it('shows fresh history after incomplete metrics, confirmations, and completion', () => {
    const value = status()
    value.levels[1].recentImprovement = null
    value.levels[1].observationCount = 12
    expect(getConvergenceProgress(value)).toBe('Rebuilding history · 12/76 observations')
    value.levels[1].confirmations = 3
    expect(getConvergenceProgress(value)).toBe('Below threshold · confirming 3/5')
    value.levels[1].qualified = true
    expect(getConvergenceProgress(value)).toBe('Threshold confirmed · 5/5 checks')
    value.completionReason = 'safety_cap'
    expect(getConvergenceProgress(value)).toBe('Safety cap reached')
  })

  it('does not manufacture percentages for legacy runs or invalid measurements', () => {
    const value = status()
    delete value.levels[1].recentImprovement
    delete value.levels[1].observationCount
    value.levels[1].waitingModels = ['Heavy', 'Ultra']
    expect(getConvergenceProgress(value)).toBe('Above threshold · 2 models')
    value.levels[1].recentImprovement = NaN
    expect(normalizeConvergenceStatus(value)?.levels[1].recentImprovement).toBeUndefined()
    value.phase = 'unavailable'
    expect(getConvergenceProgress(value)).toBe('Monitoring unavailable')
  })
})
