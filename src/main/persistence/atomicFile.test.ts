import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { atomicWriteFileSync, atomicWriteJsonSync, readJsonWithBackupSync } from './atomicFile'

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'nam-bot-atomic-file-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('atomic file persistence', () => {
  it('replaces a file while retaining the prior version as a backup', () => {
    const targetPath = join(createTemporaryDirectory(), 'settings.json')

    atomicWriteFileSync(targetPath, 'first')
    atomicWriteFileSync(targetPath, 'second')

    expect(readFileSync(targetPath, 'utf-8')).toBe('second')
    expect(readFileSync(`${targetPath}.bak`, 'utf-8')).toBe('first')
  })

  it('recovers JSON from the backup when the primary file is truncated', () => {
    const targetPath = join(createTemporaryDirectory(), 'queue.json')
    atomicWriteJsonSync(targetPath, [{ id: 'first' }])
    atomicWriteJsonSync(targetPath, [{ id: 'second' }])
    writeFileSync(targetPath, '{', 'utf-8')

    expect(readJsonWithBackupSync(targetPath)).toEqual([{ id: 'first' }])
    expect(existsSync(`${targetPath}.bak`)).toBe(true)
  })

  it('keeps a good backup when the file being replaced is damaged', () => {
    const targetPath = join(createTemporaryDirectory(), 'settings.json')
    atomicWriteJsonSync(targetPath, { version: 1 })
    atomicWriteJsonSync(targetPath, { version: 2 })
    writeFileSync(targetPath, '{', 'utf-8')

    atomicWriteJsonSync(targetPath, { version: 3 })

    expect(JSON.parse(readFileSync(targetPath, 'utf-8'))).toEqual({ version: 3 })
    expect(JSON.parse(readFileSync(`${targetPath}.bak`, 'utf-8'))).toEqual({ version: 1 })
    atomicWriteJsonSync(targetPath, { version: 4 })
    expect(JSON.parse(readFileSync(`${targetPath}.bak`, 'utf-8'))).toEqual({ version: 3 })
  })
})
