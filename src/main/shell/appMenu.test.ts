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

function submenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const items = findItem(template, label).submenu
  if (!Array.isArray(items)) throw new Error(`Missing submenu: ${label}`)
  return items
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
    for (const role of ['quit', 'close', 'minimize', 'togglefullscreen', 'resetZoom', 'zoomIn', 'zoomOut']) {
      expect(serialized).toContain(`"role":"${role}"`)
    }
    expect(serialized.includes('"role":"zoom"')).toBe(platform === 'darwin')
    Reflect.apply(findItem(template, 'About NAM-BOT').click!, undefined, [])
    expect(actions.showAboutDialog).toHaveBeenCalledOnce()
    expect(template[0].label).toBe(platform === 'darwin' ? 'NAM-BOT' : 'File')
  })

  it('keeps Mac application commands in the app menu and registers native Help and Window menus', () => {
    const template = buildApplicationMenuTemplate(options(), 'darwin')
    const application = submenu(template, 'NAM-BOT')
    for (const label of ['About NAM-BOT', 'Check for Updates', 'Settings']) {
      expect(application.some(item => item.label === label)).toBe(true)
      expect(submenu(template, 'Help').some(item => item.label === label)).toBe(false)
    }
    expect(submenu(template, 'Navigate').some(item => item.label === 'Settings')).toBe(false)
    expect(findItem(template, 'Window').role).toBe('windowMenu')
    expect(findItem(template, 'Help').role).toBe('help')
    expect(submenu(template, 'File').some(item => item.role === 'close')).toBe(true)
    expect(submenu(template, 'File').some(item => item.role === 'quit')).toBe(false)
    expect(findItem(template, 'Open Workspace Folder').accelerator).toBe('Command+Shift+O')
    expect(submenu(template, 'Edit').some(item => item.role === 'pasteAndMatchStyle')).toBe(true)
  })

  it('never exposes Mac-only roles in Windows menus', () => {
    const template = buildApplicationMenuTemplate(options(), 'win32')
    const serialized = JSON.stringify(template)
    for (const role of ['appMenu', 'windowMenu', 'zoom', 'front', 'services', 'hide', 'hideOthers', 'unhide', 'pasteAndMatchStyle']) {
      expect(serialized).not.toContain(`"role":"${role}"`)
    }
    expect(findItem(template, 'Help').role).toBe('help')
    expect(submenu(template, 'Help').some(item => item.label === 'About NAM-BOT')).toBe(true)
    expect(submenu(template, 'Navigate').some(item => item.label === 'Settings')).toBe(true)
    expect(findItem(template, 'Open Workspace Folder').accelerator).toBe('Ctrl+Shift+W')
  })
})
