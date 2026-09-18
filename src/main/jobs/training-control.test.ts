import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { requestTrainingControl } from './training-control'

const directories: string[] = []
function workspace(): string {
  const path = mkdtempSync(join(tmpdir(), 'nam-control-'))
  directories.push(path)
  mkdirSync(join(path, 'training-controls'))
  writeFileSync(join(path, 'training-controls', 'ready.json'), '{}')
  return path
}

function respond(path: string, response: object): string {
  const request: { id: string } = JSON.parse(readFileSync(join(path, 'training-controls', 'request.json'), 'utf8'))
  writeFileSync(join(path, 'training-controls', `${request.id}.json`), JSON.stringify(response))
  return request.id
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('training controls', () => {
  it('waits for a matching response and uses only its own workspace model path', async () => {
    const path = workspace()
    const pending = requestTrainingControl(path, 'export', () => true)
    const id = respond(path, { ok: true, epoch: 42, modelPath: 'untrusted-path.nam' })
    await expect(pending).resolves.toEqual({ epoch: 42, modelPath: join(path, 'training-controls', id, 'model.nam') })
  })

  it('reports a trainer export failure instead of pretending a model was saved', async () => {
    const path = workspace()
    const pending = requestTrainingControl(path, 'export', () => true)
    respond(path, { ok: false, error: 'No validated checkpoint' })
    await expect(pending).rejects.toThrow('No validated checkpoint')
  })

  it('fails when training has ended and bounds waiting for an unresponsive trainer', async () => {
    await expect(requestTrainingControl(workspace(), 'export', () => false)).rejects.toThrow('Training ended')
    await expect(requestTrainingControl(workspace(), 'export', () => true, 1)).rejects.toThrow('Timed out')
  })
})
