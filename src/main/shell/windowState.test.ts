import { EventEmitter } from 'node:events'
import { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {}, Menu: {}, ipcMain: { handle: vi.fn() },
  BrowserWindow: class extends EventEmitter {
    contents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, getZoomFactor: () => 1.25, send: vi.fn()
    })
    get webContents(): typeof this.contents { return this.contents }
    isDestroyed = (): boolean => false
    isFocused = (): boolean => true
    isFullScreen = (): boolean => false
  }
}))
import { getShellWindowState, isAppMenuAnchor, observeShellWindow } from './windowState'

describe('window state subscriptions', () => {
  it('publishes native state and removes all subscriptions on window close', () => {
    const window = new BrowserWindow()
    const cleanup = observeShellWindow(window)
    expect(getShellWindowState(window)).toEqual({ focused: true, fullscreen: false, zoomFactor: 1.25 })
    window.emit('blur')
    expect(window.webContents.send).toHaveBeenCalledOnce()
    const contents = window.webContents
    vi.spyOn(window, 'webContents', 'get').mockImplementation(() => { throw new Error('Object has been destroyed') })
    window.emit('closed')
    expect(window.eventNames()).toEqual([])
    expect(contents.eventNames()).toEqual([])
    cleanup()
    const replacement = new BrowserWindow()
    observeShellWindow(replacement)
    replacement.emit('focus')
    expect(replacement.webContents.send).toHaveBeenCalledOnce()
  })
  it('accepts finite popup anchors and rejects malformed renderer input', () => {
    expect(isAppMenuAnchor({ x: 8, y: 40 })).toBe(true)
    for (const value of [null, undefined, {}, { x: '8', y: 40 }, { x: NaN, y: 2 }, { x: 0, y: Infinity }]) {
      expect(isAppMenuAnchor(value)).toBe(false)
    }
  })
})
