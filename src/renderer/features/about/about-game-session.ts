import { createInitialEpochRunnerState, pauseEpochRunner, type EpochRunnerState } from './about-game-engine'
import type { EpochRunnerRecords } from './about-game-storage'

export interface EpochRunnerSession {
  id: string
  state: EpochRunnerState
  recorded: boolean
  records?: EpochRunnerRecords
}

// Only a snapshot survives navigation. No timers, audio, or game loops run off-screen.
let session: EpochRunnerSession | null = null
let sequence = 0

export function hasEpochRunnerSession(): boolean {
  return session !== null
}

export function getEpochRunnerSession(): EpochRunnerSession {
  if (!session) {
    session = { id: `${Date.now()}-${++sequence}`, state: createInitialEpochRunnerState(), recorded: false }
  }
  return session
}

export function clearEpochRunnerSession(): void {
  session = null
}

export function suspendEpochRunnerSession(): void {
  if (session) session.state = pauseEpochRunner(session.state)
}
