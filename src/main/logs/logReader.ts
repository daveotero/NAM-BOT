import { open, stat } from 'fs/promises'

import type { LogChunk } from '../../shared/logs'

const DEFAULT_INITIAL_TAIL_BYTES = 256 * 1024
const DEFAULT_INCREMENTAL_CHUNK_BYTES = 128 * 1024

interface LogReadOptions {
  initialTailBytes?: number
  maxChunkBytes?: number
}

function buildMissingLogChunk(): LogChunk {
  return {
    content: '',
    nextOffset: 0,
    reset: true,
    truncated: false
  }
}

export async function readLogChunk(
  filePath: string,
  requestedOffset: number | null,
  options?: LogReadOptions
): Promise<LogChunk> {
  let fileSize: number
  try {
    fileSize = (await stat(filePath)).size
  } catch {
    return buildMissingLogChunk()
  }

  const initialTailBytes = options?.initialTailBytes ?? DEFAULT_INITIAL_TAIL_BYTES
  const maxChunkBytes = options?.maxChunkBytes ?? DEFAULT_INCREMENTAL_CHUNK_BYTES
  const hasValidOffset = requestedOffset != null
    && Number.isSafeInteger(requestedOffset)
    && requestedOffset >= 0
    && requestedOffset <= fileSize
  const reset = !hasValidOffset
  const startOffset = hasValidOffset
    ? requestedOffset
    : Math.max(0, fileSize - initialTailBytes)
  const truncated = reset && startOffset > 0
  const availableBytes = Math.max(0, fileSize - startOffset)
  const bytesToRead = Math.min(availableBytes, reset ? initialTailBytes : maxChunkBytes)

  if (bytesToRead === 0) {
    return {
      content: '',
      nextOffset: startOffset,
      reset,
      truncated
    }
  }

  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(bytesToRead)
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, startOffset)
    const completeBytes = getCompleteByteLength(buffer.subarray(0, bytesRead), startOffset + bytesRead >= fileSize)
    let content = buffer.subarray(0, completeBytes).toString('utf-8')
    if (truncated) {
      const firstLineBreak = content.indexOf('\n')
      if (firstLineBreak >= 0) {
        content = content.slice(firstLineBreak + 1)
      }
      content = `[Earlier log output omitted]\n${content}`
    }

    return {
      content,
      nextOffset: startOffset + completeBytes,
      reset,
      truncated
    }
  } finally {
    await handle.close()
  }
}

/** Bytes to decode now: end a partial read on a line break, and never inside a UTF-8 character. */
function getCompleteByteLength(bytes: Buffer, reachedEnd: boolean): number {
  if (!reachedEnd) {
    const lastLineBreak = bytes.lastIndexOf(0x0a)
    if (lastLineBreak >= 0) {
      return lastLineBreak + 1
    }
  }

  // Back up over an incomplete multi-byte sequence; the next read starts at its first byte.
  let leadIndex = bytes.length - 1
  while (leadIndex >= 0 && bytes.length - leadIndex <= 3 && (bytes[leadIndex] & 0xc0) === 0x80) {
    leadIndex -= 1
  }
  if (leadIndex < 0) {
    return bytes.length
  }
  const lead = bytes[leadIndex]
  const sequenceLength = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
  return bytes.length - leadIndex < sequenceLength ? leadIndex : bytes.length
}
