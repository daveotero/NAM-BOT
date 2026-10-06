import { describe, expect, it, vi } from 'vitest'
import { configureAppIdentity, getAppIdentity, getWindowsAppDetails } from './appIdentity'

describe('application identity', () => {
  it('keeps the installer identity and gives unpackaged runs their own identity', () => {
    expect(getAppIdentity(true)).toEqual({ appId: 'com.nambot.app', name: 'NAM-BOT' })
    expect(getAppIdentity(false)).toEqual({ appId: 'com.nambot.app.dev', name: 'NAM-BOT Dev' })
  })

  it.each([true, false])('preserves existing data paths when isPackaged=%s', (isPackaged) => {
    const paths = new Map([['userData', 'existing-profile'], ['sessionData', 'isolated-chromium']])
    const application = {
      isPackaged,
      getPath: vi.fn((name: string): string => paths.get(name) ?? ''),
      setPath: vi.fn((name: string, value: string): void => { paths.set(name, value) }),
      setName: vi.fn((): void => { paths.set('userData', 'renamed-profile'); paths.set('sessionData', 'renamed-chromium') }),
      setAppUserModelId: vi.fn()
    }
    const identity = configureAppIdentity(application, 'win32')
    expect(application.setName).toHaveBeenCalledWith(identity.name)
    expect(application.setAppUserModelId).toHaveBeenCalledWith(identity.appId)
    expect(paths.get('userData')).toBe('existing-profile')
    expect(paths.get('sessionData')).toBe('isolated-chromium')
  })

  const nonWindowsPlatforms: NodeJS.Platform[] = ['darwin', 'linux']
  it.each(nonWindowsPlatforms)('does not call Windows identity APIs on %s', (platform) => {
    const application = {
      isPackaged: false,
      getPath: vi.fn((): string => '/existing/profile'),
      setPath: vi.fn(),
      setName: vi.fn(),
      setAppUserModelId: vi.fn()
    }
    configureAppIdentity(application, platform)
    expect(application.setName).toHaveBeenCalledWith('NAM-BOT Dev')
    expect(application.setAppUserModelId).not.toHaveBeenCalled()
  })

  it('relaunches production using only its executable, with matching installer identity', () => {
    expect(getWindowsAppDetails({
      isPackaged: true,
      executablePath: 'C:\\Program Files\\NAM-BOT\\NAM-BOT.exe',
      appPath: 'C:\\Program Files\\NAM-BOT\\resources\\app.asar',
      iconPath: 'C:\\Program Files\\NAM-BOT\\resources\\icon.ico'
    })).toEqual({
      appId: 'com.nambot.app',
      relaunchDisplayName: 'NAM-BOT',
      relaunchCommand: '"C:\\Program Files\\NAM-BOT\\NAM-BOT.exe"',
      appIconPath: 'C:\\Program Files\\NAM-BOT\\resources\\icon.ico',
      appIconIndex: 0
    })
  })

  it('relaunches development with an absolute project argument and the NAM-BOT icon', () => {
    expect(getWindowsAppDetails({
      isPackaged: false,
      executablePath: 'C:\\Dev Projects\\NAM-BOT\\node_modules\\electron\\dist\\electron.exe',
      appPath: 'C:\\Dev Projects\\NAM-BOT',
      iconPath: 'C:\\Dev Projects\\NAM-BOT\\build\\icon.ico'
    })).toEqual({
      appId: 'com.nambot.app.dev',
      relaunchDisplayName: 'NAM-BOT Dev',
      relaunchCommand: '"C:\\Dev Projects\\NAM-BOT\\node_modules\\electron\\dist\\electron.exe" "C:\\Dev Projects\\NAM-BOT"',
      appIconPath: 'C:\\Dev Projects\\NAM-BOT\\build\\icon.ico',
      appIconIndex: 0
    })
  })

  it('quotes trailing backslashes and does not invent an icon when none is available', () => {
    expect(getWindowsAppDetails({ isPackaged: false, executablePath: 'C:\\electron.exe', appPath: 'C:\\Project\\' }))
      .toEqual({ appId: 'com.nambot.app.dev', relaunchDisplayName: 'NAM-BOT Dev',
        relaunchCommand: '"C:\\electron.exe" "C:\\Project\\\\"' })
  })
})
