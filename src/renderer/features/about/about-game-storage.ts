import { EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY } from './about-game-engine'

export const EPOCH_RUNNER_STORAGE_KEY = 'nam-bot:epoch-runner-v2'

export interface EpochRunnerScore {
  id: string
  initials: string
  score: number
  epochs: number
  timeMs: number
  outcome: 'won' | 'game-over'
}

export interface EpochRunnerRecords {
  scores: EpochRunnerScore[]
  initials: string
  soundEnabled: boolean
  upgradeSeen: boolean
  legacyBest: number
}

export interface EpochRunnerStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function getEpochRunnerStorage(): EpochRunnerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function normalizeInitials(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isScore(value: unknown): value is EpochRunnerScore {
  return isRecord(value) && typeof value.id === 'string' && value.id.length <= 100
    && typeof value.initials === 'string' && /^[A-Z0-9]{1,3}$/.test(value.initials)
    && isNonnegativeNumber(value.score) && Number.isSafeInteger(value.score)
    && isNonnegativeNumber(value.epochs) && value.epochs <= 666 && Number.isInteger(value.epochs)
    && isNonnegativeNumber(value.timeMs)
    && (value.outcome === 'won' || value.outcome === 'game-over')
}

export function rankEpochRunnerScores(scores: EpochRunnerScore[]): EpochRunnerScore[] {
  return [...new Map(scores.map((score) => [score.id, score])).values()]
    .sort((left, right) => right.score - left.score || left.timeMs - right.timeMs)
    .slice(0, 10)
}

export function loadEpochRunnerRecords(storage: EpochRunnerStorage | null = getEpochRunnerStorage()): EpochRunnerRecords {
  const defaults: EpochRunnerRecords = { scores: [], initials: 'BOT', soundEnabled: false, upgradeSeen: false, legacyBest: 0 }
  try {
    const legacy = Number(storage?.getItem(EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY))
    defaults.legacyBest = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : 0
    const raw = storage?.getItem(EPOCH_RUNNER_STORAGE_KEY)
    const data: unknown = raw ? JSON.parse(raw) : null
    if (!isRecord(data)) return defaults
    return {
      scores: Array.isArray(data.scores) ? rankEpochRunnerScores(data.scores.filter(isScore)) : [],
      initials: typeof data.initials === 'string' ? normalizeInitials(data.initials) || 'BOT' : 'BOT',
      soundEnabled: data.soundEnabled === true,
      upgradeSeen: data.upgradeSeen === true,
      legacyBest: defaults.legacyBest
    }
  } catch {
    return defaults
  }
}

export function saveEpochRunnerRecords(records: EpochRunnerRecords, storage: EpochRunnerStorage | null = getEpochRunnerStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(EPOCH_RUNNER_STORAGE_KEY, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}
