import { mkdirSync, rmSync } from 'fs'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ root: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-updates-${Date.now()}-${Math.random()}` }))
vi.mock('electron', () => ({ app: { getPath: () => paths.root, getVersion: () => '0.6.5' }, BrowserWindow: { getAllWindows: () => [] } }))

beforeEach(() => {
  vi.resetModules()
  mkdirSync(paths.root, { recursive: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(paths.root, { recursive: true, force: true })
})

describe('update-check failures', () => {
  it('keeps the last successful check date and reports a failed manual attempt', async () => {
    const { saveUpdateStatus } = await import('../persistence/updateStore')
    const previousCheck = '2026-01-01T00:00:00.000Z'
    saveUpdateStatus({ currentVersion: '0.6.5', state: 'up-to-date', latestVersion: '0.6.5', lastCheckedAt: previousCheck, releaseUrl: null, changelogUrl: null })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline') }))
    const { checkForUpdates } = await import('./updateService')
    const status = await checkForUpdates(true)
    expect(status).toMatchObject({ state: 'error', lastCheckedAt: previousCheck, checkError: 'Offline' })
    expect(status.lastAttemptAt).not.toBe(previousCheck)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v0.6.5' }), { status: 200 })))
    expect(await checkForUpdates(true)).toMatchObject({ state: 'up-to-date', checkError: null })
  })
})
