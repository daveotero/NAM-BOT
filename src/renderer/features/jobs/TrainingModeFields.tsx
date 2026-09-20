import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CONVERGENCE_DESCRIPTIONS, CONVERGENCE_LABELS, CONVERGENCE_LEVELS, DEFAULT_CONVERGENCE_MAX_EPOCHS, type TrainingStoppingPolicy } from '../../../shared/convergence'

const EPOCHS_HELP = 'Number of epochs to train before saving the model. Reaching a convergence threshold will not stop a fixed-epoch run.'
const MAXIMUM_EPOCHS_HELP = 'Stops and saves the model at this epoch if convergence has not stopped the run sooner. This required limit is remembered for future jobs.'

interface TrainingModeFieldsProps {
  id: string
  policy: TrainingStoppingPolicy
  onChange: (policy: TrainingStoppingPolicy) => void
  fixedEpochs: number | null
  onFixedEpochsChange?: (epochs: number) => void
  epochInputId?: string
  epochLabel?: string
  epochHelp?: string
  epochInputLabel?: string
  epochOverride?: ReactNode
  defaultMaxEpochs?: number
  maxEpochsHelp?: string
  inherit?: { selected: boolean; onSelect: () => void }
  defaultAction?: { label: string; title: string; onClick: () => void }
  epochsLocked?: boolean
  disabled?: boolean
}

export default function TrainingModeFields({ id, policy, onChange, fixedEpochs, onFixedEpochsChange,
  epochInputId = `${id}-epochs`, epochLabel = 'Epochs', epochHelp = EPOCHS_HELP, epochInputLabel = 'Fixed epoch count',
  epochOverride, defaultMaxEpochs = DEFAULT_CONVERGENCE_MAX_EPOCHS, maxEpochsHelp = MAXIMUM_EPOCHS_HELP,
  inherit, defaultAction, epochsLocked = false, disabled = false }: TrainingModeFieldsProps): React.JSX.Element {
  const automatic = policy.mode === 'convergence'
  const rememberedCap = useRef(policy.maxEpochs ?? defaultMaxEpochs)
  const [capInput, setCapInput] = useState(String(rememberedCap.current))
  useEffect(() => {
    if (policy.maxEpochs != null) rememberedCap.current = policy.maxEpochs
    setCapInput(String(policy.maxEpochs ?? rememberedCap.current))
  }, [policy.maxEpochs, policy.mode])
  return <section className="property-row" aria-label="Training mode settings">
    <span className="form-label" id={`${id}-mode-label`} title="Choose whether training stops at a fixed epoch count or automatically when ESR improvements settle.">Training mode</span>
    <div className="property-control property-option-panel training-mode-settings">
      <div className="training-mode-body">
        <div className="job-mode-options">
          <div className="toggle-group job-mode-controls" role="group" aria-labelledby={`${id}-mode-label`}>
            <button type="button" className={`btn btn-sm ${automatic ? 'btn-green' : 'btn-secondary'}`}
              disabled={disabled} aria-pressed={automatic}
              title="Automatically stop and save when every exported model meets the selected convergence threshold, or when the maximum epoch limit is reached."
              onClick={() => { if (!automatic) onChange({ ...policy, mode: 'convergence', maxEpochs: rememberedCap.current }) }}>Auto convergence</button>
            <button type="button" className={`btn btn-sm ${!automatic && !inherit?.selected ? 'btn-blue' : 'btn-secondary'}`}
              disabled={disabled} aria-pressed={!automatic && !inherit?.selected} aria-label="Fixed epochs"
              title="Train to the chosen epoch count. Convergence is monitored for information only."
              onClick={() => { if (automatic || inherit?.selected) onChange({ ...policy, mode: 'fixed', maxEpochs: null }) }}>
              Fixed epochs
            </button>
            {inherit && <button type="button" className={`btn btn-sm ${inherit.selected ? 'btn-blue' : 'btn-secondary'}`}
              disabled={disabled} aria-pressed={inherit.selected}
              title="Use the last training mode, threshold, and safety limit selected in the job editor. With no saved choice, use Balanced auto convergence with a 2,000-epoch limit."
              onClick={inherit.onSelect}>Last used</button>}
          </div>
          {defaultAction && <button type="button" className="btn btn-sm btn-secondary" disabled={disabled}
            title={defaultAction.title} onClick={defaultAction.onClick}>{defaultAction.label}</button>}
        </div>
      {!automatic ? <div className="property-row">
          <label className="form-label" htmlFor={epochInputId} title={epochHelp}>{epochLabel}</label>
          <div className="property-control">
            <div className="job-mode-options">
              <div className="property-input-unit">
                <input id={epochInputId} type="number" min="1" step="1" className="form-input" aria-label={epochInputLabel}
                  title={epochHelp}
                  value={fixedEpochs ?? ''} placeholder="Not set"
                  disabled={disabled || epochsLocked || !onFixedEpochsChange}
                  onChange={event => onFixedEpochsChange?.(Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
                <span className="ui-text-secondary">epochs</span>
              </div>
            </div>
            {epochOverride ?? (epochsLocked && <p className="property-hint">This preset locks epoch count through its expert learning config.</p>)}
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
            <label className="form-label" htmlFor={`${id}-cap`} title={maxEpochsHelp}>Maximum epochs</label>
            <div className="property-control">
              <div className="job-mode-options">
                <div className="property-input-unit">
                  <input id={`${id}-cap`} type="number" min="1" step="1" required className="form-input" disabled={disabled}
                    title={maxEpochsHelp}
                    value={capInput} onChange={event => {
                      setCapInput(event.target.value)
                      const value = Number(event.target.value)
                      if (Number.isSafeInteger(value) && value > 0) onChange({ ...policy, maxEpochs: value })
                    }} onBlur={() => setCapInput(String(policy.maxEpochs ?? rememberedCap.current))} />
                  <span className="ui-text-secondary">epochs</span>
                </div>
              </div>
            </div>
          </div></>}
      </div>
    </div>
  </section>
}
