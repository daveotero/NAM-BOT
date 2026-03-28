import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { selectOutputRunDirectory } from './runDirectoryResolver'

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nam-bot-run-dir-'))
  tempDirs.push(dir)
  return dir
}

function touchPath(targetPath: string, isoTime: string): void {
  const date = new Date(isoTime)
  utimesSync(targetPath, date, date)
}

function buildStartedAtIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
): string {
  return new Date(year, monthIndex, day, hour, minute, second, millisecond).toISOString()
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('selectOutputRunDirectory', () => {
  it('selects the timestamp folder for the current run even if an older run was touched recently', () => {
    const root = createTempDir()
    const olderRun = join(root, '2026-03-28-10-00-00')
    const currentRun = join(root, '2026-03-28-10-00-05')
    mkdirSync(olderRun)
    mkdirSync(currentRun)

    // Simulate an old folder being touched after completion.
    const oldLogPath = join(olderRun, 'old-job.log')
    writeFileSync(oldLogPath, 'done', 'utf-8')
    touchPath(oldLogPath, buildStartedAtIso(2026, 2, 28, 10, 0, 6, 0))

    const startedAt = buildStartedAtIso(2026, 2, 28, 10, 0, 5, 600)
    const selection = selectOutputRunDirectory(root, startedAt, null)
    expect(selection.detectedRunDirectory).toBe(currentRun)
    expect(selection.kind).toBe('timestamp')
  })

  it('does not select root fallback from nested artifacts in older timestamp folders', () => {
    const root = createTempDir()
    const olderRun = join(root, '2026-03-28-10-00-00')
    mkdirSync(olderRun)
    const nestedArtifact = join(olderRun, 'model.nam')
    writeFileSync(nestedArtifact, 'artifact', 'utf-8')
    touchPath(nestedArtifact, buildStartedAtIso(2026, 2, 28, 10, 0, 6, 0))

    const startedAt = buildStartedAtIso(2026, 2, 28, 10, 0, 5, 600)
    const selection = selectOutputRunDirectory(root, startedAt, null)
    expect(selection.detectedRunDirectory).toBeNull()
    expect(selection.kind).toBe('none')
  })

  it('accepts same-second timestamp folders with the tolerance window', () => {
    const root = createTempDir()
    const currentRun = join(root, '2026-03-28-10-00-05')
    mkdirSync(currentRun)

    const startedAt = buildStartedAtIso(2026, 2, 28, 10, 0, 5, 900)
    const selection = selectOutputRunDirectory(root, startedAt, null)
    expect(selection.detectedRunDirectory).toBe(currentRun)
    expect(selection.kind).toBe('timestamp')
  })

  it('falls back to root when fresh artifacts exist directly under output root', () => {
    const root = createTempDir()
    const modelPath = join(root, 'model.nam')
    writeFileSync(modelPath, 'artifact', 'utf-8')
    touchPath(modelPath, buildStartedAtIso(2026, 2, 28, 10, 0, 7, 0))

    const startedAt = buildStartedAtIso(2026, 2, 28, 10, 0, 5, 600)
    const selection = selectOutputRunDirectory(root, startedAt, null)
    expect(selection.detectedRunDirectory).toBe(root)
    expect(selection.kind).toBe('root')
  })

  it('upgrades from root fallback to timestamp folder and keeps that timestamp binding stable', () => {
    const root = createTempDir()
    const modelPath = join(root, 'model.nam')
    writeFileSync(modelPath, 'artifact', 'utf-8')
    touchPath(modelPath, buildStartedAtIso(2026, 2, 28, 10, 0, 6, 0))

    const startedAt = buildStartedAtIso(2026, 2, 28, 10, 0, 5, 600)
    const fallbackSelection = selectOutputRunDirectory(root, startedAt, null)
    expect(fallbackSelection.detectedRunDirectory).toBe(root)
    expect(fallbackSelection.kind).toBe('root')

    const firstTimestampRun = join(root, '2026-03-28-10-00-05')
    mkdirSync(firstTimestampRun)
    const upgradedSelection = selectOutputRunDirectory(
      root,
      startedAt,
      fallbackSelection.detectedRunDirectory
    )
    expect(upgradedSelection.detectedRunDirectory).toBe(firstTimestampRun)
    expect(upgradedSelection.kind).toBe('timestamp')

    // Even if a newer timestamp folder appears later, keep the first bound timestamp.
    const laterTimestampRun = join(root, '2026-03-28-10-00-08')
    mkdirSync(laterTimestampRun)
    const lockedSelection = selectOutputRunDirectory(
      root,
      startedAt,
      upgradedSelection.detectedRunDirectory
    )
    expect(lockedSelection.detectedRunDirectory).toBe(firstTimestampRun)
    expect(lockedSelection.kind).toBe('timestamp')
  })
})
