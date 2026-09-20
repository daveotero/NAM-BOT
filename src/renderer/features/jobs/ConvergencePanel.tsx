import { CONVERGENCE_LABELS, normalizeStoppingPolicy } from '../../../shared/convergence'
import type { JobRuntimeState } from '../../../shared/training'

interface ConvergencePanelProps {
  runtime: JobRuntimeState
}

export default function ConvergencePanel({ runtime }: ConvergencePanelProps): React.JSX.Element | null {
  const status = runtime.convergence
  const policy = status?.policy ?? normalizeStoppingPolicy(runtime.frozenJob.stopping)
  if (!status && !['preparing', 'running', 'stopping'].includes(runtime.status)) return null
  const reached = status?.levels.find(level => level.level === status.achievedLevel)
  const selected = status?.levels.find(level => level.level === policy.level)

  return <section className="runtime-detail-facts" data-no-card-toggle="true" aria-label="Convergence status">
    <div className="runtime-detail-fact">
      <span className="runtime-detail-label">Mode</span>
      <span className="runtime-detail-value runtime-detail-value-wrap">{policy.mode === 'fixed' ? 'Fixed epochs'
        : `Auto convergence · ${CONVERGENCE_LABELS[policy.level]}`}</span>
    </div>
    <div className="runtime-detail-fact">
      <span className="runtime-detail-label">Convergence</span>
      <span className="runtime-detail-value runtime-detail-value-wrap" title={status?.levels.map(level => `${CONVERGENCE_LABELS[level.level]}: ${level.firstReachedEpoch == null ? 'not reached'
          : `first reached at epoch ${level.firstReachedEpoch}${level.qualified ? '; currently qualifies' : '; ESR has changed since then'}`}`).join('\n')}>
          {reached ? `${CONVERGENCE_LABELS[reached.level]} · epoch ${reached.firstReachedEpoch}`
            : status?.phase === 'unavailable' ? 'Monitoring unavailable'
              : !status ? runtime.trainingControlReady ? 'Monitoring unavailable for this run' : 'Waiting for trainer monitoring'
                : status.phase === 'warming' ? 'Gathering validation history' : 'Still improving'}
        {policy.mode === 'fixed' && <> <span className="ui-text-secondary">(Monitoring only)</span></>}
        {reached && status && policy.mode === 'convergence' && selected && !status.completionReason && selected.waitingModels.length > 0
          && <> <span className="ui-text-secondary" title={`Still improving: ${selected.waitingModels.join(', ')}`}>(Still improving)</span></>}
      </span>
    </div>
    {status?.message && <p className="property-hint" role="status">{status.message} Training continues unless another stopping condition is reached.</p>}
  </section>
}
