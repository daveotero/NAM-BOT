import { describe, expect, it } from 'vitest'
import {
  EPOCH_RUNNER_STORAGE_KEY, loadEpochRunnerRecords, normalizeInitials, rankEpochRunnerScores,
  saveEpochRunnerRecords, type EpochRunnerScore, type EpochRunnerStorage
} from './about-game-storage'
import { EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY } from './about-game-engine'
import {
  clearEpochRunnerSession, getEpochRunnerSession, hasEpochRunnerSession, suspendEpochRunnerSession
} from './about-game-session'

function storage(): EpochRunnerStorage {
  const data = new Map<string, string>()
  return { getItem: (key: string): string | null => data.get(key) ?? null, setItem: (key: string, value: string): void => { data.set(key, value) } }
}

function score(id: string, points: number, timeMs: number = 1000): EpochRunnerScore {
  return { id, initials: 'BOT', score: points, timeMs, epochs: 666, outcome: 'won' }
}

describe('Epoch Runner local archive', () => {
  it('starts muted, preserves the legacy score, and round-trips new records separately', () => {
    const disk = storage()
    disk.setItem(EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY, '123456')
    const data = loadEpochRunnerRecords(disk)
    expect(data).toMatchObject({ legacyBest: 123456, scores: [], soundEnabled: false, upgradeSeen: false })
    expect(saveEpochRunnerRecords({ ...data, soundEnabled: true, upgradeSeen: true, scores: [score('a', 500)] }, disk)).toBe(true)
    expect(loadEpochRunnerRecords(disk)).toMatchObject({ legacyBest: 123456, soundEnabled: true, upgradeSeen: true, scores: [score('a', 500)] })
    expect(disk.getItem(EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY)).toBe('123456')
  })

  it('sorts score descending and time ascending, limits to ten, and updates duplicate run IDs', () => {
    const records = Array.from({ length: 12 }, (_, i) => score(String(i), i * 100))
    const ranked = rankEpochRunnerScores([...records, score('11', 1100, 2000), score('fast', 1100, 500)])
    expect(ranked).toHaveLength(10)
    expect(ranked.slice(0, 2).map((entry) => entry.id)).toEqual(['fast', '11'])
    expect(ranked.filter((entry) => entry.id === '11')).toHaveLength(1)
  })

  it('recovers from malformed data and ignores invalid score records', () => {
    const disk = storage()
    disk.setItem(EPOCH_RUNNER_STORAGE_KEY, '{broken')
    expect(loadEpochRunnerRecords(disk).scores).toEqual([])
    disk.setItem(EPOCH_RUNNER_STORAGE_KEY, JSON.stringify({ scores: [score('ok', 50), { ...score('bad', 2), epochs: 999 }, null], initials: 'a!b@c', soundEnabled: 'true' }))
    expect(loadEpochRunnerRecords(disk)).toMatchObject({ scores: [score('ok', 50)], initials: 'ABC', soundEnabled: false })
    expect(normalizeInitials(' Dave! ')).toBe('DAV')
  })

  it('does not throw if storage is unavailable or the quota is exhausted', () => {
    const disk: EpochRunnerStorage = { getItem: (): never => { throw new Error('denied') }, setItem: (): never => { throw new Error('full') } }
    const records = loadEpochRunnerRecords(disk)
    expect(records.scores).toEqual([])
    expect(saveEpochRunnerRecords(records, disk)).toBe(false)
    expect(saveEpochRunnerRecords(records, null)).toBe(false)
  })

  it('retains a paused in-memory session across navigation and clears it on explicit exit', () => {
    clearEpochRunnerSession()
    const session = getEpochRunnerSession()
    session.state = { ...session.state, status: 'running', score: 123, timeMs: 456 }
    suspendEpochRunnerSession()
    expect(getEpochRunnerSession()).toBe(session)
    expect(session.state).toMatchObject({ status: 'paused', score: 123, timeMs: 456 })
    clearEpochRunnerSession()
    expect(hasEpochRunnerSession()).toBe(false)
    expect(getEpochRunnerSession().id).not.toBe(session.id)
    clearEpochRunnerSession()
  })
})
