import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({ app: { name: 'NAM-BOT' }, Menu: {} }))
import { buildApplicationMenuTemplate } from './appMenu'

function findItem(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  for (const item of template) {
    if (item.label === label) return item
    if (Array.isArray(item.submenu)) {
      try { return findItem(item.submenu, label) } catch { /* Search the next submenu. */ }
    }
  }
  throw new Error(`Missing menu item: ${label}`)
}

function options(): Parameters<typeof buildApplicationMenuTemplate>[0] {
  return {
    isDev: false, sendAppCommand: vi.fn(), checkForUpdates: vi.fn(), openLogsFolder: vi.fn(),
    openWorkspaceFolder: vi.fn(), openPresetsFolder: vi.fn(), showAboutDialog: vi.fn(),
    openProjectSite: vi.fn(), openIssueTracker: vi.fn(), openNamGitHub: vi.fn()
  }
}

describe('shared native menu definition', () => {
  it.each(['win32', 'darwin'] as const)('preserves shortcuts and guarded commands on %s', (platform) => {
    const actions = options()
    const template = buildApplicationMenuTemplate(actions, platform)
    for (const [label, accelerator] of Object.entries({
      'New Job': 'CmdOrCtrl+N', 'New Preset': 'CmdOrCtrl+Shift+N', Dashboard: 'CmdOrCtrl+1',
      Jobs: 'CmdOrCtrl+2', Presets: 'CmdOrCtrl+3', Diagnostics: 'CmdOrCtrl+4',
      'Setup Guide': 'F1', Settings: 'CmdOrCtrl+,'
    })) expect(findItem(template, label).accelerator).toBe(accelerator)
    // Call these closures exactly as the popup does: no renderer navigation shortcut.
    for (const label of ['New Job', 'New Preset', 'Jobs']) Reflect.apply(findItem(template, label).click!, undefined, [])
    expect(actions.sendAppCommand).toHaveBeenNthCalledWith(1, { type: 'new-job' })
    expect(actions.sendAppCommand).toHaveBeenNthCalledWith(2, { type: 'new-preset' })
    expect(actions.sendAppCommand).toHaveBeenNthCalledWith(3, { type: 'navigate', path: '/jobs' })
    const serialized = JSON.stringify(template)
    for (const role of ['quit', 'close', 'minimize', 'zoom', 'togglefullscreen', 'resetZoom', 'zoomIn', 'zoomOut']) {
      expect(serialized).toContain(`"role":"${role}"`)
    }
    expect(template[0].label).toBe(platform === 'darwin' ? 'NAM-BOT' : 'File')
  })
})
