import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { NamBotApi } from './index'

const exposed = vi.hoisted((): { api: NamBotApi | null } => ({ api: null }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: NamBotApi): void => { exposed.api = api } },
  ipcRenderer: Object.assign(new EventEmitter(), { invoke: vi.fn(), send: vi.fn() }),
  webUtils: {}
}))
import { ipcRenderer } from 'electron'

afterEach(() => { vi.unstubAllGlobals() })

it('exposes typed shell events without the IPC event and unsubscribes cleanly', async () => {
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  await import('./index')
  if (!exposed.api) throw new Error('Preload did not expose the bridge')
  const state = { focused: false, fullscreen: true, zoomFactor: 1.5 }
  const update = vi.fn()
  const open = vi.fn()
  const stopUpdate = exposed.api.shell.onWindowState(update)
  const stopMenu = exposed.api.shell.onMenuRequested(open)
  ipcRenderer.emit('shell:windowState', { privileged: true }, state)
  ipcRenderer.emit('shell:menuRequested', { privileged: true })
  expect(update).toHaveBeenCalledExactlyOnceWith(state)
  expect(open).toHaveBeenCalledExactlyOnceWith()
  stopUpdate()
  stopMenu()
  expect(ipcRenderer.listenerCount('shell:windowState')).toBe(0)
  expect(ipcRenderer.listenerCount('shell:menuRequested')).toBe(0)
})
