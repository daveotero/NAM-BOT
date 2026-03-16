import { app, Menu, type MenuItemConstructorOptions } from 'electron'

import type { AppCommand, AppRoute } from '../../shared/appShell'

interface AppMenuOptions {
  isDev: boolean
  checkForUpdates: () => void
  openLogsFolder: () => void
  openWorkspaceFolder: () => void
  openPresetsFolder: () => void
  sendAppCommand: (command: AppCommand) => void
  showAboutDialog: () => void
  openProjectSite: () => void
  openIssueTracker: () => void
  openNamGitHub: () => void
}

function navigateTo(sendAppCommand: AppMenuOptions['sendAppCommand'], path: AppRoute): void {
  sendAppCommand({
    type: 'navigate',
    path
  })
}

export function installApplicationMenu(options: AppMenuOptions): void {
  const template: MenuItemConstructorOptions[] = []

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push(
    {
      label: 'File',
      submenu: [
        {
          label: 'New Job',
          accelerator: 'CmdOrCtrl+N',
          click: () => options.sendAppCommand({ type: 'new-job' })
        },
        {
          label: 'New Preset',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => options.sendAppCommand({ type: 'new-preset' })
        },
        { type: 'separator' },
        {
          label: 'Open Logs Folder',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => options.openLogsFolder()
        },
        {
          label: 'Open Workspace Folder',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => options.openWorkspaceFolder()
        },
        {
          label: 'Open Presets Folder',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => options.openPresetsFolder()
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => navigateTo(options.sendAppCommand, '/')
        },
        {
          label: 'Jobs',
          accelerator: 'CmdOrCtrl+2',
          click: () => navigateTo(options.sendAppCommand, '/jobs')
        },
        {
          label: 'Presets',
          accelerator: 'CmdOrCtrl+3',
          click: () => navigateTo(options.sendAppCommand, '/presets')
        },
        {
          label: 'Diagnostics',
          accelerator: 'CmdOrCtrl+4',
          click: () => navigateTo(options.sendAppCommand, '/diagnostics')
        },
        {
          label: 'Setup Guide',
          accelerator: 'F1',
          click: () => navigateTo(options.sendAppCommand, '/help')
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => navigateTo(options.sendAppCommand, '/settings')
        },
        {
          label: 'Credits',
          click: () => navigateTo(options.sendAppCommand, '/about')
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        ...(options.isDev
          ? [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const }
            ]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Setup Guide',
          click: () => navigateTo(options.sendAppCommand, '/help')
        },
        {
          label: 'Diagnostics',
          click: () => navigateTo(options.sendAppCommand, '/diagnostics')
        },
        { type: 'separator' },
        {
          label: 'Project Website',
          click: () => options.openProjectSite()
        },
        {
          label: 'Report an Issue',
          click: () => options.openIssueTracker()
        },
        {
          label: 'Neural Amp Modeler GitHub',
          click: () => options.openNamGitHub()
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => options.checkForUpdates()
        },
        {
          label: 'About NAM-BOT',
          click: () => options.showAboutDialog()
        }
      ]
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
