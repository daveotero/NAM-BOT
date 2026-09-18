import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type Input } from 'electron'
import log from 'electron-log/main'

import type { AppMenuAnchor, ShellWindowState } from '../../shared/appShell'
import { popupApplicationMenu } from './appMenu'

export function getShellWindowState(window: BrowserWindow): ShellWindowState {
  return {
    focused: window.isFocused(),
    fullscreen: window.isFullScreen(),
    zoomFactor: window.webContents.getZoomFactor()
  }
}

export function isAppMenuAnchor(value: unknown): value is AppMenuAnchor {
  return typeof value === 'object' && value !== null
    && 'x' in value && typeof value.x === 'number' && Number.isFinite(value.x)
    && 'y' in value && typeof value.y === 'number' && Number.isFinite(value.y)
}

/** Registered once. The getter deliberately follows macOS window recreation. */
export function setupWindowShellIpc(getWindow: () => BrowserWindow | null): void {
  const requireWindow = (event: IpcMainInvokeEvent): BrowserWindow => {
    const window = getWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Shell request must originate from the main application window')
    }
    return window
  }
  ipcMain.handle('shell:getWindowState', (event): ShellWindowState => {
    try {
      return getShellWindowState(requireWindow(event))
    } catch (error) {
      log.error('Could not read window state:', error)
      throw error
    }
  })
  let menuOpen = false
  ipcMain.handle('shell:openMenu', async (event, anchor: unknown): Promise<void> => {
    try {
      const window = requireWindow(event)
      if (process.platform !== 'win32' || !isAppMenuAnchor(anchor)) throw new Error('Invalid application menu request')
      if (menuOpen) return
      menuOpen = true
      try {
        await popupApplicationMenu(window, anchor)
      } finally {
        menuOpen = false
      }
    } catch (error) {
      log.error('Could not open application menu:', error)
      throw error
    }
  })
}

export function observeShellWindow(window: BrowserWindow): () => void {
  // The BrowserWindow.webContents getter is invalid once 'closed' fires.
  const contents = window.webContents
  const publish = (): void => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('shell:windowState', getShellWindowState(window))
    }
  }
  const onInput = (event: Electron.Event, input: Input): void => {
    if (process.platform === 'win32' && input.key === 'F10' && !input.alt && !input.control && !input.meta && !input.shift) {
      event.preventDefault()
      if (input.type === 'keyDown' && !input.isAutoRepeat) window.webContents.send('shell:menuRequested')
    }
  }
  window.on('focus', publish)
  window.on('blur', publish)
  window.on('enter-full-screen', publish)
  window.on('leave-full-screen', publish)
  window.on('resize', publish)
  window.webContents.on('zoom-changed', publish)
  window.webContents.on('before-input-event', onInput)
  // Chromium's zoom-changed precedes application of keyboard zoom. The renderer
  // resize event queries the final value as well, including programmatic zoom.
  const cleanup = (): void => {
    window.removeListener('focus', publish)
    window.removeListener('blur', publish)
    window.removeListener('enter-full-screen', publish)
    window.removeListener('leave-full-screen', publish)
    window.removeListener('resize', publish)
    contents.removeListener('zoom-changed', publish)
    contents.removeListener('before-input-event', onInput)
    window.removeListener('closed', cleanup)
  }
  window.once('closed', cleanup)
  return cleanup
}
