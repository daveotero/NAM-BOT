// This module MUST precede persistence imports: those cache userData at load time.
import { app } from 'electron'
import { lstatSync, mkdirSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, isAbsolute, join } from 'path'

export const isDesktopShellSmoke = process.env.NAM_BOT_DESKTOP_SHELL_SMOKE === '1'

if (isDesktopShellSmoke) {
  const directory = process.env.NAM_BOT_DESKTOP_SHELL_DATA
  // A smoke run must never fall back to the user's real application data.
  if (!directory || !isAbsolute(directory) || !basename(directory).startsWith('nam-bot-shell-')
    || realpathSync.native(dirname(directory)) !== realpathSync.native(tmpdir())) {
    throw new Error('Desktop smoke tests require a dedicated nam-bot-shell-* directory in the system temp folder')
  }
  mkdirSync(directory, { recursive: true })
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Smoke data must not be a directory link')
  app.setPath('userData', realpathSync.native(directory))
  app.setPath('sessionData', join(realpathSync.native(directory), 'chromium'))
}
