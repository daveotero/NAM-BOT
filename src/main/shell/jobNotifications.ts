import { Notification } from 'electron'
import log from 'electron-log/main'
import { areDesktopNotificationsAvailable } from '../../shared/notifications'
import type { JobRuntimeState } from '../types/jobs'

interface NotificationDependencies {
  platform?: string
  isEnabled: () => boolean
  navigate: (path: '/jobs' | '/diagnostics') => void
}

export function createJobNotifier(dependencies: NotificationDependencies): (runtime: JobRuntimeState) => void {
  const reported = new Map<string, string>()
  return (runtime: JobRuntimeState): void => {
    const event = runtime.status === 'queued' && runtime.errorCategory === 'a2_diagnostics_pending'
      ? 'diagnostics'
      : runtime.status === 'succeeded' ? 'completed'
        : runtime.status === 'failed' ? 'failed'
          : runtime.status === 'canceled' ? 'canceled' : null
    if (!event) {
      reported.delete(runtime.jobId)
      return
    }
    const identity = `${event}:${runtime.startedAt ?? ''}`
    if (reported.get(runtime.jobId) === identity) return
    // Consume suppressed events too, so changing preferences never replays old alerts.
    reported.set(runtime.jobId, identity)
    try {
      if (!areDesktopNotificationsAvailable(dependencies.platform ?? process.platform) || !dependencies.isEnabled() || !Notification.isSupported()) return
      const notification = new Notification({
        title: event === 'completed' ? 'Training completed'
          : event === 'failed' ? 'Training failed'
            : event === 'canceled' ? 'Training canceled' : 'Diagnostics needed before training',
        body: runtime.jobName
      })
      notification.on('click', () => dependencies.navigate(event === 'diagnostics' ? '/diagnostics' : '/jobs'))
      notification.on('failed', (_event, error) => log.warn('Could not show job notification:', error))
      notification.show()
    } catch (error) {
      log.warn('Could not show job notification:', error)
    }
  }
}
