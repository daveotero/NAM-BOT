import { useEffect, useState } from 'react'
import { CONVERGENCE_DESCRIPTIONS, CONVERGENCE_LABELS, CONVERGENCE_LEVELS, type TrainingStoppingPolicy } from '../../../shared/convergence'
import { getStoredConvergenceMaxEpochs } from './training-mode-preferences'

const EPOCHS_HELP = 'Number of epochs to train before saving the model. Reaching a convergence threshold will not stop a fixed-epoch run.'
const MAXIMUM_EPOCHS_HELP = 'Stops and saves the model at this epoch if convergence has not stopped the run sooner. This required limit is remembered for future jobs.'

interface TrainingModeFieldsProps {
  id: string
  policy: TrainingStoppingPolicy
  onChange: (policy: TrainingStoppingPolicy) => void
  fixedEpochs: number | null
  onFixedEpochsChange?: (epochs: number) => void
  epochInputId?: string
  epochsLocked?: boolean
  disabled?: boolean
}

export default function TrainingModeFields({ id, policy, onChange, fixedEpochs, onFixedEpochsChange,
  epochInputId = `${id}-epochs`, epochsLocked = false, disabled = false }: TrainingModeFieldsProps): React.JSX.Element {
  const automatic = policy.mode === 'convergence'
  const [capInput, setCapInput] = useState(String(policy.maxEpochs ?? getStoredConvergenceMaxEpochs()))
  useEffect(() => {
    setCapInput(String(policy.maxEpochs ?? getStoredConvergenceMaxEpochs()))
  }, [policy.maxEpochs, policy.mode])
  return <section className="property-row" aria-label="Training mode settings">
    <span className="form-label" id={`${id}-mode-label`} title="Choose whether training stops at a fixed epoch count or automatically when ESR improvements settle.">Training mode</span>
    <div className="property-control property-option-panel training-mode-settings">
      <div className="training-mode-body">
          <div className="toggle-group job-mode-controls" role="group" aria-labelledby={`${id}-mode-label`}>
            <button type="button" className={`btn btn-sm ${!automatic ? 'btn-blue' : 'btn-secondary'}`}
              disabled={disabled} aria-pressed={!automatic} aria-label="Fixed epochs"
              title="Train to the chosen epoch count. Convergence is monitored for information only."
              onClick={() => { if (automatic) onChange({ ...policy, mode: 'fixed', maxEpochs: null }) }}>
              Fixed epochs
            </button>
            <button type="button" className={`btn btn-sm ${automatic ? 'btn-green' : 'btn-secondary'}`}
              disabled={disabled} aria-pressed={automatic}
              title="Automatically stop and save when every exported model meets the selected convergence threshold, or when the maximum epoch limit is reached."
              onClick={() => { if (!automatic) onChange({ ...policy, mode: 'convergence', maxEpochs: getStoredConvergenceMaxEpochs() }) }}>Auto convergence</button>
          </div>
      {!automatic ? <div className="property-row">
          <label className="form-label" htmlFor={epochInputId} title={EPOCHS_HELP}>Epochs</label>
          <div className="property-control">
            <div className="job-mode-options">
              <div className="property-input-unit">
                <input id={epochInputId} type="number" min="1" step="1" className="form-input" aria-label="Fixed epoch count"
                  title={EPOCHS_HELP}
                  value={fixedEpochs ?? ''} placeholder="Not set"
                  disabled={disabled || epochsLocked || !onFixedEpochsChange}
                  onChange={event => onFixedEpochsChange?.(Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
                <span className="ui-text-secondary">epochs</span>
              </div>
            </div>
            {epochsLocked && <p className="property-hint">This preset locks epoch count through its expert learning config.</p>}
          </div>
        </div> : <><div className="property-row">
            <span className="form-label" id={`${id}-level-label`} title="Controls how small ESR improvements must become, and how long they are observed, before training stops.">Threshold</span>
            <div className="property-control">
              <div className="toggle-group job-mode-controls" role="group" aria-labelledby={`${id}-level-label`}>
                {CONVERGENCE_LEVELS.map(level => <button key={level} type="button"
                  className={`btn btn-sm ${policy.level === level ? 'btn-blue' : 'btn-secondary'}`}
                  aria-pressed={policy.level === level} disabled={disabled} title={CONVERGENCE_DESCRIPTIONS[level]}
                  onClick={() => onChange({ ...policy, level })}>{CONVERGENCE_LABELS[level]}</button>)}
              </div>
            </div>
          </div>
          <div className="property-row">
            <label className="form-label" htmlFor={`${id}-cap`} title={MAXIMUM_EPOCHS_HELP}>Maximum epochs</label>
            <div className="property-control">
              <div className="job-mode-options">
                <div className="property-input-unit">
                  <input id={`${id}-cap`} type="number" min="1" step="1" required className="form-input" disabled={disabled}
                    title={MAXIMUM_EPOCHS_HELP}
                    value={capInput} onChange={event => {
                      setCapInput(event.target.value)
                      const value = Number(event.target.value)
                      if (Number.isSafeInteger(value) && value > 0) onChange({ ...policy, maxEpochs: value })
                    }} onBlur={() => setCapInput(String(policy.maxEpochs ?? getStoredConvergenceMaxEpochs()))} />
                  <span className="ui-text-secondary">epochs</span>
                </div>
              </div>
            </div>
          </div></>}
      </div>
    </div>
  </section>
}
