import { CONVERGENCE_LABELS, CONVERGENCE_LEVELS, isConvergenceLevel, type TrainingStoppingPolicy } from '../../../shared/convergence'

interface TrainingModeFieldsProps {
  id: string
  policy: TrainingStoppingPolicy
  onChange: (policy: TrainingStoppingPolicy) => void
  fixedAllowed?: boolean
  disabled?: boolean
  live?: boolean
}

export default function TrainingModeFields({ id, policy, onChange, fixedAllowed = true, disabled = false, live = false }: TrainingModeFieldsProps): React.JSX.Element {
  return <>
    <div className="property-row">
      <label className="form-label" htmlFor={`${id}-mode`}>Training mode</label>
      <div className="property-control">
        <select id={`${id}-mode`} className="form-select" value={policy.mode} disabled={disabled}
          onChange={event => onChange({ ...policy, mode: event.target.value === 'convergence' ? 'convergence' : 'fixed', maxEpochs: null })}>
          <option value="fixed" disabled={!fixedAllowed}>Fixed epochs</option>
          <option value="convergence">Until convergence</option>
        </select>
        {!fixedAllowed && <p className="property-hint">This run started without a fixed epoch target. You can change the level or safety cap.</p>}
        {live && fixedAllowed && policy.mode === 'convergence' && <p className="property-hint">Replaces the original epoch limit. You can switch back while training is still running.</p>}
      </div>
    </div>
    {policy.mode === 'convergence' && <>
      <div className="property-row">
        <label className="form-label" htmlFor={`${id}-level`}>Convergence level</label>
        <div className="property-control">
          <select id={`${id}-level`} className="form-select" value={policy.level} disabled={disabled}
            onChange={event => { if (isConvergenceLevel(event.target.value)) onChange({ ...policy, level: event.target.value }) }}>
            {CONVERGENCE_LEVELS.map(level => <option key={level} value={level}>{CONVERGENCE_LABELS[level]}</option>)}
          </select>
          <p className="property-hint">{policy.level === 'fast' ? 'Stops earlier, accepting more potential improvement.'
            : policy.level === 'balanced' ? 'Balances training time with smaller remaining gains.' : 'Waits longer for smaller improvements to settle.'}</p>
        </div>
      </div>
      <div className="property-row">
        <label className="form-label" htmlFor={`${id}-cap`}>Safety cap</label>
        <div className="property-control">
          <input id={`${id}-cap`} type="number" min="1" step="1" className="form-input" placeholder="No cap" disabled={disabled}
            value={policy.maxEpochs ?? ''} onChange={event => onChange({ ...policy,
              maxEpochs: event.target.value === '' ? null : Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
          <p className="property-hint">Optional maximum total epochs. Leave empty to train until convergence.</p>
        </div>
      </div>
    </>}
  </>
}
