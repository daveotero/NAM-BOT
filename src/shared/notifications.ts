export const MACOS_NOTIFICATIONS_UNAVAILABLE = 'Desktop notifications are unavailable in unsigned macOS applications. Check Jobs or Dashboard for training results.'

export function areDesktopNotificationsAvailable(platform: string): boolean {
  // NAM-BOT's macOS releases are unsigned. Revisit this when signing is enabled.
  return platform !== 'darwin'
}
