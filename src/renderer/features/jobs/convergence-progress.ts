import { CONVERGENCE_CONFIRMATIONS, CONVERGENCE_RULES, convergenceCompletionLabel, type ConvergenceStatus } from '../../../shared/convergence'

export function getConvergenceProgress(status: ConvergenceStatus): string {
  if (status.completionReason) return convergenceCompletionLabel(status)
  if (status.phase === 'unavailable') return 'Monitoring unavailable'
  const rule = CONVERGENCE_RULES[status.policy.level]
  const selected = status.levels.find(level => level.level === status.policy.level)
  if (status.validatedEpochs < rule.minimum) {
    return `Gathering history · ${status.validatedEpochs}/${rule.minimum} validated epochs`
  }
  if (selected?.qualified) return `Threshold confirmed · ${CONVERGENCE_CONFIRMATIONS}/${CONVERGENCE_CONFIRMATIONS} checks`
  if (selected && selected.confirmations > 0) {
    return `Below threshold · confirming ${selected.confirmations}/${CONVERGENCE_CONFIRMATIONS}`
  }
  if (selected && typeof selected.recentImprovement === 'number') {
    const percent = selected.recentImprovement * 100
    // Preserve which side of the strict threshold the measurement falls on after rounding.
    const threshold = rule.tolerance * 100
    const display = percent >= threshold ? Math.ceil(percent * 100) / 100 : Math.floor(percent * 100) / 100
    return `${display.toFixed(2)}% recent improvement · target <${threshold.toFixed(2)}%`
  }
  if (selected?.observationCount !== undefined) {
    return `Rebuilding history · ${selected.observationCount}/${rule.window + 1} observations`
  }
  // Older trainers did not publish numeric measurements; never infer them from the chart.
  const waiting = selected?.waitingModels.length ?? 0
  return waiting > 0 ? `Above threshold · ${waiting} ${waiting === 1 ? 'model' : 'models'}` : 'Monitoring improvement'
}
