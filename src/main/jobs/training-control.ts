import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { TrainingExportEvidence } from '../../shared/training-report'
import { normalizeTrainingExportEvidence } from '../reports/report-evidence'
import { atomicWriteJsonSync } from '../persistence/atomicFile'
import { normalizeConvergenceStatus, type ConvergenceStatus, type TrainingStoppingPolicy } from '../../shared/convergence'

export interface TrainingControlResult {
  epoch: number
  modelPath: string
  reportEvidence?: TrainingExportEvidence
  reportWarning?: string
  convergence?: ConvergenceStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const pendingControls = new Map<string, Promise<unknown>>()

export function requestTrainingControl(
  workspace: string,
  action: 'export' | 'finish' | 'set_stopping_policy',
  isActive: () => boolean,
  timeoutMs = 180_000,
  policy?: TrainingStoppingPolicy
): Promise<TrainingControlResult> {
  const previous = pendingControls.get(workspace)
  const next = previous ? previous.catch(() => undefined).then(() => performTrainingControl(workspace, action, isActive, timeoutMs, policy))
    : performTrainingControl(workspace, action, isActive, timeoutMs, policy)
  pendingControls.set(workspace, next)
  void next.finally(() => {
    if (pendingControls.get(workspace) === next) pendingControls.delete(workspace)
  }).catch(() => undefined)
  return next
}

async function performTrainingControl(
  workspace: string,
  action: 'export' | 'finish' | 'set_stopping_policy',
  isActive: () => boolean,
  timeoutMs: number,
  policy?: TrainingStoppingPolicy
): Promise<TrainingControlResult> {
  if (!isActive()) throw new Error('Training ended before this command could be sent.')
  const id = uuidv4()
  const directory = join(workspace, 'training-controls')
  if (!existsSync(join(directory, 'ready.json'))) {
    throw new Error('Live export is available for new training runs after the trainer is ready.')
  }
  if (action === 'set_stopping_policy') {
    const ready: unknown = JSON.parse(readFileSync(join(directory, 'ready.json'), 'utf8'))
    if (!isRecord(ready) || ready.stoppingPolicy !== 1) throw new Error('Live training mode changes require a run started with this version of NAM-BOT.')
  }
  const expiresAt = Date.now() + timeoutMs
  const responsePath = join(directory, `${id}.json`)
  atomicWriteJsonSync(join(directory, 'request.json'), { id, action, policy, expiresAt: expiresAt / 1000 })
  while (true) {
    if (existsSync(responsePath)) {
      const result: unknown = JSON.parse(readFileSync(responsePath, 'utf8'))
      if (!isRecord(result) || result.ok !== true) {
        throw new Error(isRecord(result) && typeof result.error === 'string' ? result.error : 'The trainer could not complete the export.')
      }
      if (typeof result.epoch !== 'number' || !Number.isSafeInteger(result.epoch) || result.epoch < 1) {
        throw new Error('The trainer returned an invalid export result.')
      }
      const evidence = normalizeTrainingExportEvidence(result.reportEvidence)
      const convergence = normalizeConvergenceStatus(result.convergence)
      if (action === 'set_stopping_policy' && !convergence) throw new Error('The trainer returned an invalid training mode acknowledgment.')
      return { epoch: result.epoch, modelPath: join(directory, id, 'model.nam'),
        ...(convergence ? { convergence } : {}),
        ...(evidence ? { reportEvidence: evidence } : {}),
        ...(typeof result.reportWarning === 'string' ? { reportWarning: result.reportWarning } : {}) }

    }
    if (!isActive()) throw new Error('Training ended before the export request could be completed. Check the final model in the output folder.')
    if (Date.now() >= expiresAt) throw new Error('Timed out waiting for the trainer. Training has not been force-stopped; check its status before retrying.')
    await new Promise<void>((resolve) => setTimeout(resolve, 200))
  }
}
