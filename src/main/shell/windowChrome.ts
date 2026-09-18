import type { BrowserWindowConstructorOptions } from 'electron'

export const TITLE_BAR_HEIGHT = 44

export function getWindowChromeOptions(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#09090b', symbolColor: '#a1a1aa', height: TITLE_BAR_HEIGHT },
      // Keep menu accelerators registered, without Alt revealing a second strip.
      autoHideMenuBar: false
    }
  }
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  return {}
}
