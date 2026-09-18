import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobRuntimeState } from '../../shared/training'
import { isActiveRuntime, isFinishedTraining } from '../features/jobs/job-helpers'

const MAX_RENDERED_LOG_CHARACTERS = 512 * 1024
const CLIENT_TRUNCATION_NOTICE = '[Earlier displayed log output omitted]\n'

function limitRenderedLog(content: string): string {
  if (content.length <= MAX_RENDERED_LOG_CHARACTERS) {
    return content
  }
  return `${CLIENT_TRUNCATION_NOTICE}${content.slice(-MAX_RENDERED_LOG_CHARACTERS)}`
}

interface TerminalLogsState {
  logContents: Record<string, string>
  loadingLogIds: Set<string>
  logErrors: Record<string, string>
  loadTerminalLog: (jobId: string) => Promise<void>
  clearTerminalLog: (jobId: string) => void
}

export function useTerminalLogs(queue: JobRuntimeState[]): TerminalLogsState {
  const [logContents, setLogContents] = useState<Record<string, string>>({})
  const [loadingLogIds, setLoadingLogIds] = useState<Set<string>>(() => new Set())
  const offsetsRef = useRef<Record<string, number>>({})
  const inFlightRef = useRef<Set<string>>(new Set())
  const [logErrors, setLogErrors] = useState<Record<string, string>>({})
  const previousQueueRef = useRef<JobRuntimeState[]>(queue)
  const finalRefreshRef = useRef<Set<string>>(new Set())

  const loadTerminalLog = useCallback(async function load(jobId: string): Promise<void> {
    if (inFlightRef.current.has(jobId)) {
      return
    }

    inFlightRef.current.add(jobId)
    setLoadingLogIds((current) => new Set(current).add(jobId))
    try {
      // A terminal transition requests the latest bounded tail, even if we were behind.
      const offset = finalRefreshRef.current.delete(jobId) ? null : offsetsRef.current[jobId] ?? null
      const chunk = await window.namBot.logs.getTerminalChunk(jobId, offset)
      setLogErrors((current) => {
        const next = { ...current }
        delete next[jobId]
        return next
      })
      offsetsRef.current[jobId] = chunk.nextOffset
      if (chunk.content.length === 0 && !chunk.reset) {
        return
      }
      setLogContents((current) => ({
        ...current,
        [jobId]: limitRenderedLog(chunk.reset
          ? chunk.content
          : `${current[jobId] ?? ''}${chunk.content}`)
      }))
    } catch (error) {
      console.error(`Failed to load terminal log for ${jobId}:`, error)
      setLogErrors((current) => ({ ...current, [jobId]: `Could not read the log: ${error instanceof Error ? error.message : String(error)}. Hide and reopen the log to retry.` }))
    } finally {
      inFlightRef.current.delete(jobId)
      setLoadingLogIds((current) => {
        const next = new Set(current)
        next.delete(jobId)
        return next
      })
      if (finalRefreshRef.current.has(jobId)) void load(jobId)
    }
  }, [])

  useEffect(() => {
    const previous = new Map(previousQueueRef.current.map((runtime) => [runtime.jobId, runtime.status]))
    previousQueueRef.current = queue
    for (const runtime of queue) {
      const previousStatus = previous.get(runtime.jobId)
      if (previousStatus && isActiveRuntime(previousStatus) && isFinishedTraining(runtime)
        && (offsetsRef.current[runtime.jobId] != null || inFlightRef.current.has(runtime.jobId))) {
        finalRefreshRef.current.add(runtime.jobId)
        void loadTerminalLog(runtime.jobId)
      }
    }
  }, [queue, loadTerminalLog])

  const clearTerminalLog = useCallback((jobId: string): void => {
    delete offsetsRef.current[jobId]
    finalRefreshRef.current.delete(jobId)
    setLogErrors((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    setLogContents((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
  }, [])

  return {
    logContents,
    loadingLogIds,
    logErrors,
    loadTerminalLog,
    clearTerminalLog
  }
}
