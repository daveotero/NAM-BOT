import { randomUUID } from 'crypto'
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type MessageBoxOptions, type MessageBoxReturnValue, type WebContents } from 'electron'
import log from 'electron-log/main'

import type { AppDialogRequest } from '../../shared/appShell'

interface PendingDialog {
  owner: WebContents
  request: AppDialogRequest
  resolve: (result: MessageBoxReturnValue) => void
}

export function createAppDialogs(getWindow: () => BrowserWindow | null): {
  install: () => void
  hasPending: () => boolean
  show: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>
} {
  const ready = new Set<WebContents>()
  const observed = new WeakSet<WebContents>()
  const pending = new Map<string, PendingDialog>()

  const cancelAll = (owner: WebContents): void => {
    ready.delete(owner)
    for (const [id, entry] of pending) {
      if (entry.owner !== owner) continue
      pending.delete(id)
      entry.resolve({ response: entry.request.cancelId, checkboxChecked: false })
    }
  }
  const requireOwner = (event: IpcMainInvokeEvent): WebContents => {
    const window = getWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Dialog request must originate from the main application window')
    }
    return window.webContents
  }
  return {
    hasPending: (): boolean => pending.size > 0,
    install: (): void => {
      ipcMain.handle('shell:dialogsReady', (event, value: unknown): void => {
        try {
          const owner = requireOwner(event)
          if (value !== true) { cancelAll(owner); return }
          ready.add(owner)
          if (!observed.has(owner)) {
            observed.add(owner)
            owner.on('did-start-navigation', (event) => {
              if (event.isMainFrame && !event.isSameDocument) cancelAll(owner)
            })
            owner.on('render-process-gone', () => cancelAll(owner))
            owner.once('destroyed', () => cancelAll(owner))
          }
        } catch (error) { log.error('Could not initialize app dialogs:', error); throw error }
      })
      ipcMain.handle('shell:respondToDialog', (event, id: unknown, response: unknown): void => {
        try {
          const owner = requireOwner(event)
          const entry = typeof id === 'string' ? pending.get(id) : undefined
          if (!entry || entry.owner !== owner || typeof response !== 'number' || !Number.isInteger(response)
            || response < 0 || response >= entry.request.buttons.length) throw new Error('Invalid dialog response')
          pending.delete(entry.request.id)
          entry.resolve({ response, checkboxChecked: false })
        } catch (error) { log.error('Could not respond to app dialog:', error); throw error }
      })
    },
    show: (options: MessageBoxOptions): Promise<MessageBoxReturnValue> => {
      const window = getWindow()
      // Native dialogs remain available before the renderer is ready or if it fails.
      if (!window || window.isDestroyed() || !ready.has(window.webContents)) {
        return window && !window.isDestroyed() ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
      }
      const buttons = options.buttons?.length ? options.buttons : ['OK']
      const request: AppDialogRequest = {
        id: randomUUID(), title: options.title ?? 'NAM-BOT', message: options.message,
        detail: options.detail ?? '', buttons, cancelId: options.cancelId ?? 0, defaultId: options.defaultId ?? 0,
        tone: options.type === 'warning' || options.type === 'error' ? options.type : 'info'
      }
      return new Promise(resolve => {
        pending.set(request.id, { owner: window.webContents, request, resolve })
        window.webContents.send('shell:dialogRequested', request)
      })
    }
  }
}
