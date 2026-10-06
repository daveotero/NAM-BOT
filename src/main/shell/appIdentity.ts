import type { App, AppDetailsOptions } from 'electron'

export interface AppIdentity {
  appId: string
  name: string
}

interface WindowsAppDetailsInput {
  isPackaged: boolean
  executablePath: string
  appPath: string
  iconPath?: string
}

export function getAppIdentity(isPackaged: boolean): AppIdentity {
  return isPackaged
    ? { appId: 'com.nambot.app', name: 'NAM-BOT' }
    : { appId: 'com.nambot.app.dev', name: 'NAM-BOT Dev' }
}

export function configureAppIdentity(
  application: Pick<App, 'isPackaged' | 'getPath' | 'setPath' | 'setName' | 'setAppUserModelId'>,
  platform: NodeJS.Platform
): AppIdentity {
  const identity = getAppIdentity(application.isPackaged)
  // Renaming Electron must not move existing profiles or smoke-test overrides.
  const userDataPath = application.getPath('userData')
  const sessionDataPath = application.getPath('sessionData')
  application.setName(identity.name)
  application.setPath('userData', userDataPath)
  application.setPath('sessionData', sessionDataPath)
  if (platform === 'win32') application.setAppUserModelId(identity.appId)
  return identity
}

function quoteWindowsArgument(value: string): string {
  // Escape for CreateProcess, not cmd.exe; trailing backslashes precede our quote.
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
}

export function getWindowsAppDetails(input: WindowsAppDetailsInput): AppDetailsOptions {
  const identity = getAppIdentity(input.isPackaged)
  const launchArguments = input.isPackaged
    ? [input.executablePath]
    : [input.executablePath, input.appPath]
  return {
    appId: identity.appId,
    relaunchDisplayName: identity.name,
    relaunchCommand: launchArguments.map(quoteWindowsArgument).join(' '),
    ...(input.iconPath ? { appIconPath: input.iconPath, appIconIndex: 0 } : {})
  }
}
