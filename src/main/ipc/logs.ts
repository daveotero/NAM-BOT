import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'
import type { LogChunk } from '../../shared/logs'
import { getQueueManager } from '../jobs/queueManager'
import { readLogChunk } from '../logs/logReader'

const userDataPath = app.getPath('userData')

/** Only a job's recorded log path is readable; renderer input never builds a file path. */
function getTerminalLogPath(jobId: unknown): string | null {
  if (typeof jobId !== 'string') return null
  return getQueueManager().getQueue().find((job) => job.jobId === jobId)?.terminalLogPath ?? null
}

const EMPTY_LOG_CHUNK: LogChunk = { content: '', nextOffset: 0, reset: true, truncated: false }

export function setupLogsIpcHandlers(): void {
  log.info('Setting up logs IPC handlers')

  ipcMain.handle('logs:getTerminal', async (_event, jobId: unknown) => {
    const logPath = getTerminalLogPath(jobId)
    return logPath ? (await readLogChunk(logPath, null)).content : ''
  })

  ipcMain.handle('logs:getTerminalChunk', async (_event, jobId: unknown, offset: number | null) => {
    const logPath = getTerminalLogPath(jobId)
    return logPath ? await readLogChunk(logPath, offset) : EMPTY_LOG_CHUNK
  })

  ipcMain.handle('logs:getDiagnostics', async () => {
    const diagPath = join(userDataPath, 'logs', 'nam-bot.log')
    const result = await readLogChunk(diagPath, null, {
      initialTailBytes: 512 * 1024,
      maxChunkBytes: 512 * 1024
    })
    return result.content || 'No diagnostics available'
  })

  log.info('Logs IPC handlers registered')
}
