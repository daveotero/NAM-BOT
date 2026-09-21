import { CONVERGENCE_LABELS, CONVERGENCE_RULES, normalizeStoppingPolicy } from '../../../shared/convergence'
import type { JobRuntimeState } from '../../../shared/training'
import { getConvergenceProgress } from './convergence-progress'

interface ConvergencePanelProps {
  runtime: JobRuntimeState
}

export default function ConvergencePanel({ runtime }: ConvergencePanelProps): React.JSX.Element | null {
  const status = runtime.convergence
  const policy = status?.policy ?? normalizeStoppingPolicy(runtime.frozenJob.stopping)
  if (!status && !['preparing', 'running', 'stopping'].includes(runtime.status)) return null
  const rule = CONVERGENCE_RULES[policy.level]
  const progress = status ? getConvergenceProgress(status)
    : runtime.trainingControlReady ? 'Monitoring unavailable for this run' : 'Waiting for trainer monitoring'
  const tooltip = [
    `Largest relative best-ESR improvement or median ESR trend across all exported models over ${rule.window} validated epochs.`,
    `Every model must stay below ${(rule.tolerance * 100).toFixed(2)}% for five consecutive checks. This is not a percent-complete estimate.`,
    ...(status?.levels.map(level => `${CONVERGENCE_LABELS[level.level]}: ${level.firstReachedEpoch == null ? 'not reached'
      : `first reached at epoch ${level.firstReachedEpoch}${level.qualified ? '; currently qualifies' : '; ESR has changed since then'}`}`) ?? [])
  ].join('\n')

  return <section className="runtime-detail-facts" data-no-card-toggle="true" aria-label="Convergence status">
    <div className="runtime-detail-fact">
      <span className="runtime-detail-label">Mode</span>
      <span className="runtime-detail-value runtime-detail-value-wrap">{policy.mode === 'fixed' ? 'Fixed epochs'
        : `Auto convergence · ${CONVERGENCE_LABELS[policy.level]}`}</span>
    </div>
    <div className="runtime-detail-fact">
      <span className="runtime-detail-label">Convergence</span>
      <span className="runtime-detail-value runtime-detail-value-wrap" title={tooltip}>
        {progress}
        {policy.mode === 'fixed' && <> <span className="ui-text-secondary">(Monitoring only)</span></>}
      </span>
    </div>
    {status?.message && <p className="property-hint" role="status">{status.message}{runtime.status === 'running' && ' Training continues unless another stopping condition is reached.'}</p>}
  </section>
}
