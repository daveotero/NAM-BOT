import { EventEmitter } from 'node:events'
import { BrowserWindow, ipcMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: {}, send: vi.fn(), isLoadingMainFrame: (): boolean => false
    })
    isDestroyed = (): boolean => false
  }
}))
vi.mock('electron-log/main', () => ({ default: { error: vi.fn() } }))
import { createAppCommands } from './appCommands'

function subscribe(window: BrowserWindow, value: boolean = true): void {
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'app:commandsReady')?.[1]
  if (!handler) throw new Error('Missing command readiness handler')
  Reflect.apply(handler, undefined, [{ sender: window.webContents, senderFrame: window.webContents.mainFrame }, value])
}

beforeEach(() => vi.clearAllMocks())

describe('application commands across window lifecycles', () => {
  it('recreates a closed window and delivers the latest command only after its renderer subscribes', () => {
    const windows: BrowserWindow[] = []
    const focusWindow = vi.fn(() => { if (!windows.length) windows.push(new BrowserWindow()) })
    const commands = createAppCommands({ getWindow: () => windows[0] ?? null, focusWindow, hasModal: () => false })
    commands.install()
    commands.send({ type: 'new-job' })
    expect(windows).toHaveLength(1)
    commands.send({ type: 'navigate', path: '/settings' })
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
    subscribe(windows[0])
    expect(windows[0].webContents.send).toHaveBeenCalledExactlyOnceWith('app:command', { type: 'navigate', path: '/settings' })
    subscribe(windows[0])
    expect(windows[0].webContents.send).toHaveBeenCalledTimes(1)
    commands.send({ type: 'new-preset' })
    expect(focusWindow).toHaveBeenCalledTimes(3)
    expect(windows[0].webContents.send).toHaveBeenLastCalledWith('app:command', { type: 'new-preset' })
  })

  it('waits across reloads and subscription changes, but not same-document navigation', () => {
    const window = new BrowserWindow()
    const commands = createAppCommands({ getWindow: () => window, focusWindow: vi.fn(), hasModal: () => false })
    commands.install()
    subscribe(window)
    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    commands.send({ type: 'new-job' })
    expect(window.webContents.send).not.toHaveBeenCalled()
    subscribe(window)
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    subscribe(window, false)
    commands.send({ type: 'new-preset' })
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    subscribe(window)
    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    commands.send({ type: 'navigate', path: '/jobs' })
    expect(window.webContents.send).toHaveBeenCalledTimes(3)
  })

  it('drops pending commands after renderer loss and refuses foreign subscriptions', () => {
    const window = new BrowserWindow()
    const commands = createAppCommands({ getWindow: () => window, focusWindow: vi.fn(), hasModal: () => false })
    commands.install()
    commands.send({ type: 'new-job' })
    window.webContents.emit('render-process-gone')
    expect(() => subscribe(new BrowserWindow())).toThrow('main application window')
    subscribe(window)
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('does not navigate or reopen windows while a modal owns focus', () => {
    const window = new BrowserWindow()
    let hasModal = false
    const focusWindow = vi.fn()
    const commands = createAppCommands({ getWindow: () => window, focusWindow, hasModal: () => hasModal })
    commands.install()
    commands.send({ type: 'new-job' })
    hasModal = true
    subscribe(window)
    commands.send({ type: 'new-preset' })
    expect(focusWindow).toHaveBeenCalledOnce()
    expect(window.webContents.send).not.toHaveBeenCalled()
    hasModal = false
    subscribe(window)
    expect(window.webContents.send).not.toHaveBeenCalled()
  })
})
