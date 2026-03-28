import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const TIMESTAMP_DIRECTORY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/

export const RUN_DIRECTORY_TOLERANCE_MS = 1_000
export const RUN_ARTIFACT_LOOKBACK_MS = 15_000

export type RunDirectorySelectionKind = 'timestamp' | 'root' | 'none'

export interface RunDirectorySelection {
  detectedRunDirectory: string | null
  kind: RunDirectorySelectionKind
  reason: string
}

function parseTimestampDirectoryName(name: string): number | null {
  const match = TIMESTAMP_DIRECTORY_PATTERN.exec(name)
  if (!match) {
    return null
  }

  const [year, month, day, hour, minute, second] = match.slice(1).map((value) => Number.parseInt(value, 10))
  const timestamp = new Date(year, month - 1, day, hour, minute, second, 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getTimestampFromDirectoryPath(dirPath: string): number | null {
  const name = dirPath.replace(/\\/g, '/').split('/').pop() ?? ''
  return parseTimestampDirectoryName(name)
}

function getFileModifiedAt(filePath: string): number {
  return statSync(filePath).mtimeMs
}

function hasFreshRootArtifacts(outputRootDir: string, startedAtMs: number): boolean {
  const entries = readdirSync(outputRootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(outputRootDir, entry.name)
    const normalizedName = entry.name.toLowerCase()
    const isRelevantFile =
      entry.isFile() &&
      (normalizedName.endsWith('.ckpt') ||
        normalizedName.endsWith('.nam') ||
        normalizedName.endsWith('comparison.png'))
    const isRelevantDirectory = entry.isDirectory() && normalizedName.includes('lightning_logs')

    if (!isRelevantFile && !isRelevantDirectory) {
      continue
    }

    if (getFileModifiedAt(fullPath) >= startedAtMs - RUN_ARTIFACT_LOOKBACK_MS) {
      return true
    }
  }

  return false
}

export function selectOutputRunDirectory(
  outputRootDir: string,
  startedAt: string | undefined,
  currentResolvedRunDirectory: string | null | undefined
): RunDirectorySelection {
  if (!outputRootDir || !startedAt) {
    return {
      detectedRunDirectory: null,
      kind: 'none',
      reason: 'missing_output_root_or_started_at'
    }
  }

  if (!existsSync(outputRootDir)) {
    return {
      detectedRunDirectory: null,
      kind: 'none',
      reason: 'output_root_missing'
    }
  }

  if (currentResolvedRunDirectory && currentResolvedRunDirectory !== outputRootDir) {
    const parsedCurrentTimestamp = getTimestampFromDirectoryPath(currentResolvedRunDirectory)
    if (parsedCurrentTimestamp != null && existsSync(currentResolvedRunDirectory)) {
      return {
        detectedRunDirectory: currentResolvedRunDirectory,
        kind: 'timestamp',
        reason: 'keep_existing_timestamp_binding'
      }
    }
  }

  const startedAtMs = Date.parse(startedAt)
  if (!Number.isFinite(startedAtMs)) {
    return {
      detectedRunDirectory: null,
      kind: 'none',
      reason: 'invalid_started_at'
    }
  }

  const entries = readdirSync(outputRootDir, { withFileTypes: true })
  const timestampCandidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = join(outputRootDir, entry.name)
      return {
        path: fullPath,
        timestampMs: parseTimestampDirectoryName(entry.name)
      }
    })
    .filter((entry): entry is { path: string; timestampMs: number } => entry.timestampMs != null)
    .filter((entry) => entry.timestampMs >= startedAtMs - RUN_DIRECTORY_TOLERANCE_MS)
    .sort((left, right) => left.timestampMs - right.timestampMs)

  if (timestampCandidates.length > 0) {
    return {
      detectedRunDirectory: timestampCandidates[0].path,
      kind: 'timestamp',
      reason: 'timestamp_candidate_selected'
    }
  }

  if (hasFreshRootArtifacts(outputRootDir, startedAtMs)) {
    return {
      detectedRunDirectory: outputRootDir,
      kind: 'root',
      reason: 'fresh_root_artifacts_detected'
    }
  }

  if (currentResolvedRunDirectory === outputRootDir && existsSync(outputRootDir)) {
    return {
      detectedRunDirectory: outputRootDir,
      kind: 'root',
      reason: 'keep_existing_root_binding'
    }
  }

  return {
    detectedRunDirectory: null,
    kind: 'none',
    reason: 'no_matching_run_directory'
  }
}
