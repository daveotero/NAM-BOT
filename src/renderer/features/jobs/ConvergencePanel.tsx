import { useState } from 'react'
import { CONVERGENCE_LABELS, normalizeStoppingPolicy, type TrainingStoppingPolicy } from '../../../shared/convergence'
import type { JobRuntimeState } from '../../../shared/training'
import TrainingModeFields from './TrainingModeFields'
import { persistStoppingPreference } from './training-mode-preferences'

interface ConvergencePanelProps {
  runtime: JobRuntimeState
  onError: (message: string | null) => void
}

export default function ConvergencePanel({ runtime, onError }: ConvergencePanelProps): React.JSX.Element | null {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState<TrainingStoppingPolicy>(normalizeStoppingPolicy(runtime.convergence?.policy ?? runtime.frozenJob.stopping))
  const status = runtime.convergence
  const policy = status?.policy ?? normalizeStoppingPolicy(runtime.frozenJob.stopping)
  const canEdit = runtime.status === 'running' && status != null && !status.completionReason
  if (!status && !['preparing', 'running', 'stopping'].includes(runtime.status)) return null
  const reached = status?.levels.find(level => level.level === status.achievedLevel)
  const selected = status?.levels.find(level => level.level === policy.level)
  const busy = pending || runtime.stoppingPolicyPending === true || runtime.modelExportPending === true

  async function apply(): Promise<void> {
    setPending(true)
    onError(null)
    try {
      const acknowledgment = await window.namBot.jobs.updateStoppingPolicy(runtime.jobId, draft)
      persistStoppingPreference(acknowledgment.policy)
      setEditing(false)
    } catch (error) { onError(error instanceof Error ? error.message : String(error)) }
    finally { setPending(false) }
  }

  return <section className="runtime-convergence" data-no-card-toggle="true" aria-label="Convergence status">
    <div className="runtime-convergence-summary">
      <span className="runtime-detail-label">Convergence</span>
      <span>{reached ? `${CONVERGENCE_LABELS[reached.level]} reached at epoch ${reached.firstReachedEpoch}`
        : status?.phase === 'unavailable' ? 'Monitoring unavailable'
          : !status ? runtime.trainingControlReady ? 'Monitoring unavailable for this run' : 'Waiting for trainer monitoring'
            : status.phase === 'warming' ? 'Gathering validation history' : 'Still improving'}</span>
      <span className="ui-text-secondary">{policy.mode === 'fixed' ? 'Observe only · fixed epochs'
        : `Auto-stop · ${CONVERGENCE_LABELS[policy.level]}${policy.maxEpochs ? ` · cap ${policy.maxEpochs}` : ' · no cap'}`}</span>
      {canEdit && <button type="button" className="btn btn-sm btn-secondary" aria-expanded={editing} disabled={busy}
        onClick={() => { setDraft(policy); setEditing(!editing) }}>Training mode</button>}
    </div>
    {status && <div className="runtime-convergence-levels" aria-label="Convergence levels reached">
      {status.levels.map(level => <span key={level.level} className={`queue-status-badge ${level.firstReachedEpoch == null ? 'queued' : 'successful'}`}
        title={level.firstReachedEpoch == null ? 'This level has not been reached' : `First reached at epoch ${level.firstReachedEpoch}${level.qualified ? '; currently qualifies' : '; ESR has changed since then'}`}>
        {CONVERGENCE_LABELS[level.level]}{level.firstReachedEpoch == null ? '' : ' ✓'}
      </span>)}
      {policy.mode === 'convergence' && selected && !status.completionReason && <span className="ui-text-secondary">
        {selected.waitingModels.length ? `Still improving: ${selected.waitingModels.join(', ')}`
          : selected.confirmations > 0 ? 'Checking sustained convergence' : `${status.validatedEpochs} validated epochs observed`}
      </span>}
    </div>}
    {status?.message && <p className="property-hint" role="status">{status.message} Training continues unless another stopping condition is reached.</p>}
    {editing && canEdit && <div className="property-workspace runtime-convergence-editor">
      <TrainingModeFields id={`stop-${runtime.jobId}`} policy={draft} onChange={setDraft} disabled={busy}
        fixedAllowed={status?.originalEpochLimit != null} live />
      {draft.mode === 'fixed' && <p className="property-hint">Original target: {status?.originalEpochLimit} epochs.
        {status?.originalEpochLimit != null && (runtime.currentEpoch ?? 0) >= status.originalEpochLimit ? ' This target has been reached; applying will finish at the next safe boundary.' : ''}</p>}
      <p className="property-hint">Uses existing history, then checks five fresh validation results. Every exported model must qualify. Further gains can still be possible.</p>
      <div className="runtime-convergence-summary">
        <button type="button" className="btn btn-sm btn-green" disabled={busy} onClick={() => void apply()}>{busy ? 'Applying...' : 'Apply mode'}</button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>}
  </section>
}
