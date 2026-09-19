import type { JobStatus, QueueControlState } from '../../shared/training'

export type TitleBarActivity = 'Idle' | 'Training' | 'Finalizing' | 'Queue Paused'

export function getTitleBarActivity(queue: ReadonlyArray<{ status: JobStatus }>, control: QueueControlState): TitleBarActivity {
  if (queue.some((job) => job.status === 'finalizing')) return 'Finalizing'
  if (queue.some((job) => ['validating', 'preparing', 'running', 'stopping'].includes(job.status))) return 'Training'
  return control.pauseReason ? 'Queue Paused' : 'Idle'
}

export function getSectionLabel(path: string): string {
  switch (path) {
    case '/jobs': return 'Jobs'
    case '/presets': return 'Presets'
    case '/settings': return 'Settings'
    case '/diagnostics': return 'Diagnostics'
    case '/help': return 'Setup Guide'
    case '/about': return 'About'
    default: return 'Dashboard'
  }
}
