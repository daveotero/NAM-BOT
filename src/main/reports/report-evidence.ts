import type { TrainingExportEvidence, ReportMetric } from '../../shared/training-report'
import { normalizeEsrHistory } from '../jobs/esr-history'
import { normalizeConvergenceStatus } from '../../shared/convergence'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeTrainingExportEvidence(value: unknown): TrainingExportEvidence | undefined {
  if (!isRecord(value) || typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))
    || !Array.isArray(value.metrics) || !Array.isArray(value.history)) return undefined
  const metrics: ReportMetric[] = []
  for (const entry of value.metrics) {
    if (!isRecord(entry) || (entry.submodelIndex !== null &&
      !(typeof entry.submodelIndex === 'number' && Number.isSafeInteger(entry.submodelIndex) && entry.submodelIndex >= 0))) continue
    metrics.push({ submodelIndex: entry.submodelIndex, submodelName: typeof entry.submodelName === 'string' ? entry.submodelName : null,
      esr: typeof entry.esr === 'number' && Number.isFinite(entry.esr) && entry.esr >= 0 ? entry.esr : null,
      epoch: typeof entry.epoch === 'number' && Number.isSafeInteger(entry.epoch) && entry.epoch > 0 ? entry.epoch : null })
  }
  return { capturedAt: value.capturedAt, metrics, history: normalizeEsrHistory(value.history), convergence: normalizeConvergenceStatus(value.convergence) }
}
