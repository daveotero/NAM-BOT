import { useEffect, useId, useRef, type ReactElement } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
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
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousFocus = document.activeElement
    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRef.current()
      }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
        if (!controls?.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault()
          first.focus()
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
      <div ref={dialogRef} className="modal-content" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onClick={(event) => event.stopPropagation()}>
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId} style={{ color: 'var(--text-steel)', lineHeight: '1.6' }}>{message}</p>
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
          <button type="button" className="btn btn-orange" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
