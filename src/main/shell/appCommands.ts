import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import log from 'electron-log/main'

import type { AppCommand } from '../../shared/appShell'

interface AppCommandOptions {
  getWindow: () => BrowserWindow | null
  focusWindow: () => void
  hasModal: () => boolean
}

/** macOS keeps the application menu alive after the last window closes. */
export function createAppCommands(options: AppCommandOptions): {
  install: () => void
  send: (command: AppCommand) => void
} {
  const ready = new WeakSet<WebContents>()
  const observed = new WeakSet<WebContents>()
  const pending = new WeakMap<WebContents, AppCommand>()
  const observe = (owner: WebContents): void => {
    if (observed.has(owner)) return
    observed.add(owner)
    owner.on('did-start-navigation', (event) => {
      if (event.isMainFrame && !event.isSameDocument) ready.delete(owner)
    })
    const clear = (): void => { ready.delete(owner); pending.delete(owner) }
    owner.on('render-process-gone', clear)
    owner.once('destroyed', clear)
  }
  return {
    install: (): void => {
      ipcMain.handle('app:commandsReady', (event, value: unknown): void => {
        try {
          const window = options.getWindow()
          if (!window || window.isDestroyed() || event.sender !== window.webContents
            || event.senderFrame !== window.webContents.mainFrame || typeof value !== 'boolean') {
            throw new Error('Command subscription must originate from the main application window')
          }
          const owner = window.webContents
          observe(owner)
          if (!value) { ready.delete(owner); return }
          ready.add(owner)
          const command = pending.get(owner)
          pending.delete(owner)
          if (command && !options.hasModal()) owner.send('app:command', command)
        } catch (error) { log.error('Could not initialize application commands:', error); throw error }
      })
    },
    send: (command: AppCommand): void => {
      if (options.hasModal()) return
      options.focusWindow()
      const window = options.getWindow()
      if (!window || window.isDestroyed()) return
      const owner = window.webContents
      observe(owner)
      if (ready.has(owner) && !owner.isLoadingMainFrame()) owner.send('app:command', command)
      // Keep the latest selection while a new/reloading renderer initializes.
      else pending.set(owner, command)
    }
  }
}
