import { useEffect, useId, useRef, type ReactElement } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
  confirmClassName?: string
  confirmDisabled?: boolean
  cancelLabel?: string
  alternateLabel?: string
  alternateClassName?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  onCheckboxChange?: (checked: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  onAlternate?: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmClassName = 'btn btn-orange',
  confirmDisabled = false,
  cancelLabel = 'Cancel',
  alternateLabel,
  alternateClassName = 'btn btn-secondary',
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  onConfirm,
  onCancel,
  onAlternate
}: ConfirmDialogProps): ReactElement | null {
  const titleId = useId()
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelHandlerRef = useRef(onCancel)
  cancelHandlerRef.current = onCancel

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousFocus = document.activeElement
    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        cancelHandlerRef.current()
      }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-message`} onClick={(event) => event.stopPropagation()}>
        <h3 id={titleId}>{title}</h3>
        <p id={`${titleId}-message`} style={{ color: 'var(--text-steel)', lineHeight: '1.6' }}>{message}</p>
        {checkboxLabel && onCheckboxChange && (
          <label className="checkbox-container modal-option">
            {checkboxLabel}
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(event) => onCheckboxChange(event.target.checked)}
            />
            <span className="checkmark" aria-hidden="true" />
          </label>
        )}
        <div className="modal-actions">
          <button ref={cancelButtonRef} type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          {alternateLabel && onAlternate && (
            <button type="button" className={alternateClassName} onClick={onAlternate}>
              {alternateLabel}
            </button>
          )}
          <button type="button" className={confirmClassName} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
