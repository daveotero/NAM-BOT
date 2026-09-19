import { useEffect, useRef, useState, type JSX } from 'react'
import log from 'electron-log/renderer'

import type { AppDialogRequest } from '../../shared/appShell'

function AppDialog({ request, onClose }: { request: AppDialogRequest; onClose: (id: string) => void }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState(false)
  const [responding, setResponding] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLButtonElement>(`[data-response="${request.defaultId}"]`)?.focus()
    return () => {
      element?.close()
      if (!document.querySelector('[role="alertdialog"]') && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [request.defaultId])

  const respond = async (response: number): Promise<void> => {
    if (responding) return
    setResponding(true)
    try {
      await window.namBot.shell.respondToDialog(request.id, response)
      onClose(request.id)
    } catch (cause) {
      log.error('Could not close app dialog:', cause)
      setError(true)
      setResponding(false)
    }
  }

  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message app-dialog-detail" data-tone={request.tone}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); void respond(request.cancelId) }}
      onKeyDown={event => event.stopPropagation()}>
      <div className="app-dialog-caption"><span>NAM-BOT</span><span>{request.tone === 'info' ? 'SYSTEM' : request.tone.toUpperCase()}</span></div>
      <div className="app-dialog-body">
        <h2 id="app-dialog-title">{request.title}</h2>
        <p id="app-dialog-message" className="app-dialog-message">{request.message}</p>
        <p id="app-dialog-detail" className="app-dialog-detail">{request.detail}</p>
        {error && <p role="alert">Could not close this dialog. Please try again.</p>}
      </div>
      <div className="app-dialog-actions">
        {request.buttons.map((label, index) => <button key={index} data-response={index} type="button" disabled={responding}
          className={`btn ${index === request.defaultId ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { void respond(index) }}>{label}</button>)}
      </div>
    </dialog>
  )
}

export default function AppDialogs(): JSX.Element | null {
  const [requests, setRequests] = useState<AppDialogRequest[]>([])
  useEffect(() => {
    const unsubscribe = window.namBot.shell.onDialogRequested(request => setRequests(current => [...current, request]))
    void window.namBot.shell.setDialogsReady(true).catch((error: unknown) => log.error('Could not initialize app dialogs:', error))
    return () => {
      unsubscribe()
      void window.namBot.shell.setDialogsReady(false).catch((error: unknown) => log.error('Could not detach app dialogs:', error))
    }
  }, [])
  const request = requests[0]
  return request ? <AppDialog key={request.id} request={request} onClose={id => setRequests(current => current.filter(entry => entry.id !== id))} /> : null
}
