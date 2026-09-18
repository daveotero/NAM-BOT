import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { atomicWriteJsonSync } from '../persistence/atomicFile'

export interface TrainingControlResult {
  epoch: number
  modelPath: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function requestTrainingControl(
  workspace: string,
  action: 'export' | 'finish',
  isActive: () => boolean,
  timeoutMs = 180_000
): Promise<TrainingControlResult> {
  const id = uuidv4()
  const directory = join(workspace, 'training-controls')
  if (!existsSync(join(directory, 'ready.json'))) {
    throw new Error('Live export is available for new training runs after the trainer is ready.')
  }
  const expiresAt = Date.now() + timeoutMs
  const responsePath = join(directory, `${id}.json`)
  atomicWriteJsonSync(join(directory, 'request.json'), { id, action, expiresAt: expiresAt / 1000 })
  while (true) {
    if (existsSync(responsePath)) {
      const result: unknown = JSON.parse(readFileSync(responsePath, 'utf8'))
      if (!isRecord(result) || result.ok !== true) {
        throw new Error(isRecord(result) && typeof result.error === 'string' ? result.error : 'The trainer could not complete the export.')
      }
      if (typeof result.epoch !== 'number' || !Number.isSafeInteger(result.epoch) || result.epoch < 1) {
        throw new Error('The trainer returned an invalid export result.')
      }
      return { epoch: result.epoch, modelPath: join(directory, id, 'model.nam') }
    }
    if (!isActive()) throw new Error('Training ended before the export request could be completed. Check the final model in the output folder.')
    if (Date.now() >= expiresAt) throw new Error('Timed out waiting for the trainer. Training has not been force-stopped; check its status before retrying.')
    await new Promise<void>((resolve) => setTimeout(resolve, 200))
  }
}
