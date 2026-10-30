import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'

interface AtomicWriteOptions {
  backup?: boolean
  /**
   * Refresh the .bak only from a current file this accepts. A file that is already damaged
   * then never replaces the good backup it was recovered from.
   */
  isValidBackup?: (contents: string) => boolean
}

export function isJsonText(contents: string): boolean {
  try {
    JSON.parse(contents)
    return true
  } catch {
    return false
  }
}

function writeTemporaryFile(targetPath: string, contents: string): string {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  const descriptor = openSync(temporaryPath, 'wx')
  try {
    writeFileSync(descriptor, contents, 'utf-8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  return temporaryPath
}

export function atomicWriteFileSync(
  targetPath: string,
  contents: string,
  options?: AtomicWriteOptions
): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  let temporaryPath: string | null = writeTemporaryFile(targetPath, contents)

  try {
    if (options?.backup !== false && existsSync(targetPath)) {
      const backupPath = `${targetPath}.bak`
      const backupContents = readFileSync(targetPath, 'utf-8')
      if (!options?.isValidBackup || options.isValidBackup(backupContents)) {
        atomicWriteFileSync(backupPath, backupContents, { backup: false })
      }
    }

    renameSync(temporaryPath, targetPath)
    temporaryPath = null
  } finally {
    if (temporaryPath && existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function atomicWriteJsonSync(targetPath: string, value: unknown): void {
  atomicWriteFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, { isValidBackup: isJsonText })
}

export function readJsonWithBackupSync(targetPath: string, onRecovery?: () => void): unknown {
  try {
    return JSON.parse(readFileSync(targetPath, 'utf-8')) as unknown
  } catch (primaryError) {
    const backupPath = `${targetPath}.bak`
    if (!existsSync(backupPath)) {
      throw primaryError
    }
    const recovered: unknown = JSON.parse(readFileSync(backupPath, 'utf-8'))
    onRecovery?.()
    return recovered
  }
}

export function removeFileIfExistsSync(targetPath: string): void {
  rmSync(targetPath, { force: true })
}
