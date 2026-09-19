import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

const mockPaths = vi.hoisted(() => ({
  userDataPath: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-queue-manager-${Date.now()}-${Math.random().toString(16).slice(2)}`
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataPath,
    getVersion: () => '0.6.5'
  },
  shell: {
    openPath: vi.fn()
  }
}))

const runNamFullMock = vi.hoisted(() => vi.fn<typeof import('../backend/adapter').runNamFull>())
const inspectTorchRuntimeMock = vi.hoisted(() => vi.fn())
const analyzeNamLatencyMock = vi.hoisted(() => vi.fn())
const requestTrainingControlMock = vi.hoisted(() => vi.fn<typeof import('./training-control').requestTrainingControl>())

vi.mock('./training-control', () => ({ requestTrainingControl: requestTrainingControlMock }))

vi.mock('../backend/adapter', () => {
  function compareVersions(left: string, right: string): number {
    const leftTokens = left.split(/[.-]/).map((token) => Number.parseInt(token, 10) || 0)
    const rightTokens = right.split(/[.-]/).map((token) => Number.parseInt(token, 10) || 0)
    const length = Math.max(leftTokens.length, rightTokens.length)

    for (let index = 0; index < length; index += 1) {
      const leftToken = leftTokens[index] ?? 0
      const rightToken = rightTokens[index] ?? 0
      if (leftToken !== rightToken) {
        return leftToken - rightToken
      }
    }

    return 0
  }

  return {
    analyzeNamLatency: analyzeNamLatencyMock,
    compareVersions,
    inspectTorchRuntime: inspectTorchRuntimeMock,
    runNamFull: runNamFullMock
  }
})

import { defaultSettings } from '../types'
import { DEFAULT_PRESET_ID, defaultJobSpec, type JobRuntimeState, type JobSpec } from '../types/jobs'
import { QueueManager } from './queueManager'
import { createTrainingPreset } from '../../shared/training'
import { deleteTrainingPreset, saveTrainingPreset } from '../persistence/presetStore'
import type { RunHooks } from '../backend/adapter'

function buildJobSpec(overrides: Partial<JobSpec> = {}): JobSpec {
  const base: JobSpec = {
    ...defaultJobSpec,
    id: 'a2-queued-diagnostics-job',
    name: 'A2 Queued Diagnostics Job',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    presetId: DEFAULT_PRESET_ID,
    inputAudioPath: `${mockPaths.userDataPath}/input.wav`,
    outputAudioPath: `${mockPaths.userDataPath}/output.wav`,
    outputRootDir: `${mockPaths.userDataPath}/models`,
    trainingOverrides: {
      ...defaultJobSpec.trainingOverrides,
      latencyMode: 'manual'
    }
  }

  return {
    ...base,
    ...overrides,
    trainingOverrides: {
      ...base.trainingOverrides,
      ...(overrides.trainingOverrides ?? {})
    }
  }
}

function writeNamModel(filePath: string): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      version: '0.0.0',
      architecture: 'WaveNet',
      config: {},
      weights: [],
      metadata: {}
    }),
    'utf-8'
  )
}

function createQueueManager(): QueueManager {
  const queueManager = new QueueManager()
  queueManager.setSettings(defaultSettings)
  return queueManager
}

beforeEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
  mkdirSync(mockPaths.userDataPath, { recursive: true })
  runNamFullMock.mockReset()
  inspectTorchRuntimeMock.mockReset()
  analyzeNamLatencyMock.mockReset()
  requestTrainingControlMock.mockReset()
  inspectTorchRuntimeMock.mockResolvedValue(null)
})

afterEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
})

describe('QueueManager lifetime statistics', () => {
  it('preserves totals across individual deletion, clear finished and app restart', () => {
    const job = buildJobSpec()
    const finished: JobRuntimeState = { jobId: job.id, jobName: job.name, status: 'succeeded', pid: null, frozenJob: job,
      frozenPreset: createTrainingPreset({ name: 'Frozen recipe' }), startedAt: '2026-09-18T10:00:00Z', finishedAt: '2026-09-18T11:00:00Z', currentEpoch: 25, userMessages: [] }
    writeFileSync(join(mockPaths.userDataPath, 'queue.json'), JSON.stringify([finished, { ...finished, jobId: 'second' }]))
    const manager = createQueueManager()
    expect(manager.getTrainingStatistics().runs).toHaveLength(2)
    manager.removeQueueItem(job.id)
    manager.clearFinished()
    expect(manager.getQueue()).toHaveLength(0)
    const restarted = createQueueManager()
    expect(restarted.getQueue()).toHaveLength(0)
    expect(restarted.getTrainingStatistics().runs).toHaveLength(2)
  })
})

describe('QueueManager A2 diagnostics gate', () => {
  it('emits failure without a success notification state when a clean exit produces no model', async () => {
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    manager.addToQueue(buildJobSpec())
    const states: string[] = []
    manager.on('jobUpdated', (runtime: JobRuntimeState) => states.push(runtime.status))
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onExit(0)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await manager.startQueue()
    expect(states).toContain('finalizing')
    expect(states).not.toContain('succeeded')
    expect(manager.getQueue()[0].errorCategory).toBe('missing_model_artifact')
  })

  it('retains the queued recipe and attribution after editing and deleting its library preset', async () => {
    const original = saveTrainingPreset(createTrainingPreset({ id: 'frozen-recipe', name: 'Original Recipe' }))
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({ presetId: original.id, appendPresetToModelFileName: true })
    manager.addToQueue(job)
    saveTrainingPreset({ ...original, name: 'Edited Recipe', values: { ...original.values, batchSize: 99 } })
    deleteTrainingPreset(original.id)
    const states: string[] = []
    manager.on('jobUpdated', (runtime: JobRuntimeState) => states.push(runtime.status))
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      expect(JSON.parse(readFileSync(args.learningConfigPath, 'utf-8'))).toMatchObject({ train_dataloader: { batch_size: 16 } })
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onStarted(1234)
      hooks.onExit(0)
      expect(states).not.toContain('succeeded')
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await manager.startQueue()
    const runtime = manager.getQueue()[0]
    expect(runtime.status).toBe('succeeded')
    expect(runtime.publishedModelPath).toContain('Original Recipe.nam')
    expect(states).toContain('finalizing')
    expect(JSON.parse(readFileSync(runtime.publishedModelPath!, 'utf-8'))).toMatchObject({ metadata: { nam_bot: { preset_name: 'Original Recipe', trained_epochs: job.trainingOverrides.epochs } } })
    expect(createQueueManager().getQueue()[0].frozenPreset?.values.batchSize).toBe(16)
    expect(() => manager.addToQueue(buildJobSpec({ id: 'missing', presetId: original.id }))).toThrow('unavailable')
  })

  it('honors expert device selection and reports effective locked epochs and latency', async () => {
    const preset = saveTrainingPreset(createTrainingPreset({
      id: 'locked-recipe', name: 'Locked',
      expert: { learning: { trainer: { accelerator: 'cpu', devices: 2, max_epochs: 3 } }, data: { common: { delay: 17 } } }
    }))
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    manager.addToQueue(buildJobSpec({ presetId: preset.id, trainingOverrides: { epochs: 200, latencyMode: 'manual', latencySamples: 0 } }))
    inspectTorchRuntimeMock.mockResolvedValue({ cudaAvailable: true, deviceName: 'GPU', torchVersion: 'test', mpsAvailable: false })
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      expect(JSON.parse(readFileSync(args.learningConfigPath, 'utf-8'))).toMatchObject({ trainer: { accelerator: 'cpu', devices: 2, max_epochs: 3 } })
      expect(manager.getCurrentJob()).toMatchObject({ plannedEpochs: 3, latencyAlignment: { delaySamples: 17 }, deviceSummary: { acceleratorRequested: 'cpu' } })
      hooks.onStarted(1234)
      hooks.onExit(1)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await manager.startQueue()
  })

  it('pauses after an unconfirmed termination, persists the pause, and ignores late process callbacks', async () => {
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    manager.addManyToQueue([buildJobSpec({ id: 'first' }), buildJobSpec({ id: 'second' })])
    const hooksByRun: RunHooks[] = []
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooksByRun.push(hooks)
      hooks.onStarted(1234 + hooksByRun.length)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => false), forceKillSync: vi.fn() }
    })
    const firstRun = manager.startQueue()
    await vi.waitFor(() => expect(hooksByRun).toHaveLength(1))
    await manager.forceStopJob('first')
    await firstRun
    expect(manager.getQueue()[1].status).toBe('queued')
    expect(manager.getControlState().pauseReason).toBe('termination_unconfirmed')
    expect(createQueueManager().getControlState().pauseReason).toBe('termination_unconfirmed')
    await expect(manager.resumeQueue()).rejects.toThrow('Confirm')
    await manager.resumeQueue(true)
    await vi.waitFor(() => expect(hooksByRun).toHaveLength(2))
    hooksByRun[0].onExit(0)
    hooksByRun[0].onError(new Error('late old-process event'))
    expect(manager.getCurrentJob()?.jobId).toBe('second')
    expect(manager.getCurrentJob()?.status).toBe('running')
    expect(manager.getQueue()[0].errorCategory).toBe('force_stop_failed')
    hooksByRun[1].onExit(1)
    await vi.waitFor(() => expect(manager.isQueueProcessing()).toBe(false))
  })

  it('allows explicitly resuming pending jobs restored after restart', async () => {
    createQueueManager().addToQueue(buildJobSpec())
    const restored = createQueueManager()
    restored.setKnownNamVersion(defaultSettings, '0.13.0')
    restored.setKnownNamVersion({ ...defaultSettings, environmentName: 'previous-target' }, '0.12.0')
    expect(restored.getControlState().pauseReason).toBe('restart')
    expect(runNamFullMock).not.toHaveBeenCalled()
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onExit(1)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await restored.resumeQueue()
    await vi.waitFor(() => expect(restored.getQueue()[0].status).toBe('failed'))
    await vi.waitFor(() => expect(restored.isQueueProcessing()).toBe(false))
  })

  it('reports completion warnings when metadata cannot be written and never announces premature success', async () => {
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    manager.addToQueue(buildJobSpec())
    const terminalEvents: string[] = []
    manager.on('jobUpdated', (runtime: JobRuntimeState) => {
      if (runtime.status === 'succeeded') {
        terminalEvents.push(runtime.status)
        expect(runtime.completionWarnings?.join(' ')).toContain('metadata failed')
      }
    })
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(join(args.outputRootDir, 'model.nam'), '{invalid model JSON')
      hooks.onStarted(1234)
      hooks.onExit(0)
      expect(terminalEvents).toEqual([])
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await manager.startQueue()
    expect(terminalEvents).toEqual(['succeeded'])
    expect(readFileSync(manager.getQueue()[0].terminalLogPath!, 'utf-8')).toContain('metadata failed')
  })

  it('exports a best-checkpoint snapshot without stopping and never treats it as the final model', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec()
    queueManager.addToQueue(job)
    let exit: (code: number) => void = () => undefined
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      if (!args.cwd) throw new Error('Missing run workspace')
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(join(args.outputRootDir, '0000_10_1.000e-3_1.000e-6.ckpt'), 'checkpoint')
      mkdirSync(join(args.cwd, 'training-controls'))
      writeFileSync(join(args.cwd, 'training-controls', 'ready.json'), '{}')
      exit = hooks.onExit
      hooks.onStarted(1234)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    requestTrainingControlMock.mockImplementation(async (workspace: string) => {
      const modelPath = join(workspace, 'snapshot.nam')
      writeNamModel(modelPath)
      return { modelPath, epoch: 10 }
    })
    const running = queueManager.startQueue()
    await vi.waitFor(() => expect(queueManager.getQueue()[0].status).toBe('running'))
    const destination = join(job.outputRootDir, 'user-snapshot.nam')
    await queueManager.exportTrainingModel(job.id, destination)
    expect(existsSync(destination)).toBe(true)
    expect(queueManager.getQueue()[0].status).toBe('running')
    expect(queueManager.getQueue()[0].modelExports?.[0].path).toBe(destination)
    expect(requestTrainingControlMock.mock.calls.map((call) => call[1])).toEqual(['export'])
    exit(0)
    await running
    expect(queueManager.getQueue()[0].status).toBe('failed')
    expect(queueManager.getQueue()[0].errorCategory).toBe('missing_model_artifact')
    expect(queueManager.getQueue()[0].publishedModelPath).toBeNull()
    expect(createQueueManager().getQueue()[0].modelExports?.[0].path).toBe(destination)
  })

  it('only finishes training after saving a model, and keeps training if export fails', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec()
    queueManager.addToQueue(job)
    const states: string[] = []
    queueManager.on('jobUpdated', (runtime: JobRuntimeState) => states.push(runtime.status))
    let exit: (code: number) => void = () => undefined
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      if (!args.cwd) throw new Error('Missing run workspace')
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(join(args.outputRootDir, '0000_10_1.000e-3_1.000e-6.ckpt'), 'checkpoint')
      mkdirSync(join(args.cwd, 'training-controls'))
      writeFileSync(join(args.cwd, 'training-controls', 'ready.json'), '{}')
      exit = hooks.onExit
      hooks.onStarted(1234)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    const running = queueManager.startQueue()
    await vi.waitFor(() => expect(queueManager.getQueue()[0].status).toBe('running'))
    const destination = join(job.outputRootDir, 'saved-snapshot.nam')
    requestTrainingControlMock.mockRejectedValueOnce(new Error('Checkpoint export failed'))
    await expect(queueManager.exportTrainingModel(job.id, destination, true)).rejects.toThrow('Checkpoint export failed')
    expect(queueManager.getQueue()[0].status).toBe('running')
    expect(queueManager.getQueue()[0].modelExportPending).toBe(false)
    expect(existsSync(destination)).toBe(false)
    requestTrainingControlMock.mockImplementation(async (workspace: string, action: string) => {
      const modelPath = join(workspace, 'snapshot.nam')
      if (action === 'export') writeNamModel(modelPath)
      else {
        expect(existsSync(destination)).toBe(true)
        writeNamModel(join(job.outputRootDir, 'model.nam'))
        exit(0)
        expect(queueManager.getQueue()[0].status).toBe('finalizing')
        expect(states).not.toContain('succeeded')
      }
      return { modelPath, epoch: 10 }
    })
    await queueManager.exportTrainingModel(job.id, destination, true)
    await running
    expect(requestTrainingControlMock.mock.calls.map((call) => call[1])).toEqual(['export', 'export', 'finish'])
    expect(queueManager.getQueue()[0].status).toBe('succeeded')
    expect(queueManager.getQueue()[0].finishedEarly).toBe(true)
    expect(queueManager.getQueue()[0].publishedModelPath).not.toBe(destination)
    expect(states).toContain('finalizing')
    expect(queueManager.getQueue()[0].userMessages.at(-1)).toBe('Training finished early. Best validated model saved.')
  })

  it.each([false, true])('preserves frozen preset attribution in live exports after preset edits and deletion (finish=%s)', async (finishAfterExport: boolean) => {
    const original = saveTrainingPreset(createTrainingPreset({ id: 'snapshot-recipe', name: 'Original Snapshot Recipe' }))
    const manager = createQueueManager()
    manager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({ presetId: original.id, appendPresetToModelFileName: true })
    manager.addToQueue(job)
    let exit: (code: number) => void = () => undefined
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      if (!args.cwd) throw new Error('Missing run workspace')
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(join(args.outputRootDir, '0000_10_1.000e-3_1.000e-6.ckpt'), 'checkpoint')
      mkdirSync(join(args.cwd, 'training-controls'))
      writeFileSync(join(args.cwd, 'training-controls', 'ready.json'), '{}')
      exit = hooks.onExit
      hooks.onStarted(1234)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    requestTrainingControlMock.mockImplementation(async (workspace, action) => {
      const modelPath = join(workspace, 'snapshot.nam')
      if (action === 'export') {
        writeNamModel(modelPath)
      } else {
        writeNamModel(join(job.outputRootDir, 'model.nam'))
        exit(0)
      }
      return { modelPath, epoch: 10 }
    })
    const running = manager.startQueue()
    try {
      await vi.waitFor(() => expect(manager.getCurrentJob()?.trainingControlReady).toBe(true))
      saveTrainingPreset({ ...original, name: 'Edited Snapshot Recipe' })
      const firstDestination = join(job.outputRootDir, 'snapshot-after-edit.nam')
      await manager.exportTrainingModel(job.id, firstDestination)
      expect(JSON.parse(readFileSync(firstDestination, 'utf8'))).toMatchObject({
        metadata: { nam_bot: { preset_name: 'Original Snapshot Recipe' } }
      })
      deleteTrainingPreset(original.id)
      const secondDestination = join(job.outputRootDir, 'snapshot-after-delete.nam')
      await manager.exportTrainingModel(job.id, secondDestination, finishAfterExport)
      expect(JSON.parse(readFileSync(secondDestination, 'utf8'))).toMatchObject({
        metadata: { nam_bot: { preset_name: 'Original Snapshot Recipe' } }
      })
      if (!finishAfterExport) {
        expect(manager.getCurrentJob()?.status).toBe('running')
        writeNamModel(join(job.outputRootDir, 'model.nam'))
        exit(0)
      }
      await running
      const runtime = manager.getQueue()[0]
      expect(runtime.status).toBe('succeeded')
      expect(runtime.finishedEarly).toBe(finishAfterExport)
      expect(runtime.modelExports).toHaveLength(2)
      expect(runtime.publishedModelPath).toContain('Original Snapshot Recipe.nam')
      expect(JSON.parse(readFileSync(runtime.publishedModelPath!, 'utf8'))).toMatchObject({
        metadata: { nam_bot: { preset_name: 'Original Snapshot Recipe' } }
      })
    } finally {
      if (manager.getCurrentJob()) exit(1)
      await running
    }
  })

  it('captures live per-model ESR and persists the final epoch even on a failed exit', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec())
    const first = { epoch: 1, step: 10, models: [{ submodelIndex: 0, submodelName: 'channels_3', esr: 0.001 }] }
    const second = { epoch: 2, step: 20, models: [{ submodelIndex: 0, submodelName: 'channels_3', esr: 0.002 }] }
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      if (!args.cwd) throw new Error('Missing run workspace')
      const historyPath = join(args.cwd, 'esr-history.jsonl')
      writeFileSync(historyPath, `${JSON.stringify(first)}\n`)
      hooks.onStarted(1234)
      expect(queueManager.getQueue()[0].esrHistory).toEqual([first])
      writeFileSync(historyPath, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`)
      hooks.onExit(1)
      return { cancel: vi.fn(), forceKill: vi.fn(async () => true), forceKillSync: vi.fn() }
    })
    await queueManager.startQueue()
    expect(queueManager.getQueue()[0].esrHistory).toEqual([first, second])
    expect(createQueueManager().getQueue()[0].esrHistory).toEqual([first, second])
    const retry = queueManager.retryJob(queueManager.getQueue()[0].jobId)
    expect(retry?.esrHistory ?? []).toEqual([])
  })

  it('allows enqueue validation while the A2 NAM version has not been confirmed', async () => {
    const queueManager = createQueueManager()

    await expect(queueManager.validateJobCanTrain(buildJobSpec())).resolves.toBeUndefined()
  })

  it('keeps a queued A2 job blocked instead of failing when diagnostics are pending', async () => {
    const queueManager = createQueueManager()
    queueManager.addToQueue(buildJobSpec())

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runNamFullMock).not.toHaveBeenCalled()
    expect(runtime.status).toBe('queued')
    expect(runtime.errorCategory).toBe('a2_diagnostics_pending')
    expect(runtime.startedAt).toBeUndefined()
    expect(runtime.finishedAt).toBeUndefined()
    expect(runtime.userMessages.at(-1)).toContain('has not confirmed the installed NAM version yet')
  })

  it('resumes a diagnostics-blocked A2 queue item after NAM version confirmation', async () => {
    const queueManager = createQueueManager()
    queueManager.addToQueue(buildJobSpec())
    await queueManager.startQueue()

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    const completedRuntime = new Promise<JobRuntimeState>((resolve) => {
      queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
        if (runtime.status === 'succeeded') {
          resolve(runtime)
        }
      })
    })
    const queueSettled = new Promise<void>((resolve) => {
      queueManager.on('queueUpdated', () => {
        if (queueManager.getQueue()[0]?.status === 'succeeded') {
          resolve()
        }
      })
    })

    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')

    await expect(completedRuntime).resolves.toMatchObject({
      status: 'succeeded',
      errorCategory: null
    })
    await queueSettled
    expect(runNamFullMock).toHaveBeenCalledTimes(1)
  })

  it('still rejects A2 queue validation when a confirmed NAM version is too old', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.12.3')

    await expect(queueManager.validateJobCanTrain(buildJobSpec())).rejects.toThrow('Installed: 0.12.3')
  })

  it('records auto-align delay in runtime details and terminal log', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    analyzeNamLatencyMock.mockResolvedValue({
      ok: true,
      recommendedLatency: 42,
      inputVersion: '3.0.0',
      strongInputMatch: true,
      warnings: {
        matchesLookahead: false,
        disagreementTooHigh: false,
        notDetected: false
      },
      delays: [42],
      errorMessage: null,
      output: 'NAM_BOT_LATENCY_ANALYSIS={"ok":true}'
    })
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onStarted(1234)
      hooks.onTerminalData('training started\n')
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    queueManager.addToQueue(buildJobSpec({
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    }))

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.latencyAlignment).toMatchObject({
      mode: 'auto',
      status: 'auto_applied',
      delaySamples: 42,
      inputVersion: '3.0.0'
    })
    expect(runtime.terminalLogPath).toBeTruthy()
    const terminalLog = readFileSync(runtime.terminalLogPath!, 'utf-8')
    expect(terminalLog).toContain('[NAM-BOT] Auto-aligning input/output latency with the NAM analyzer...')
    expect(terminalLog).toContain('[NAM-BOT] Auto-aligned latency using NAM input 3.0.0: 42 samples.')
    expect(terminalLog).toContain('training started')
  })

  it('coalesces bursts of terminal progress into bounded renderer updates', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec())
    let captureBurstUpdates = false
    let burstUpdateCount = 0
    queueManager.on('jobUpdated', () => {
      if (captureBurstUpdates) {
        burstUpdateCount += 1
      }
    })

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      hooks.onStarted(1234)
      captureBurstUpdates = true
      for (let index = 0; index < 100; index += 1) {
        hooks.onTerminalData(`progress update ${index}\n`)
      }
      await new Promise((resolve) => setTimeout(resolve, 350))
      captureBurstUpdates = false
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    expect(burstUpdateCount).toBe(1)
    expect(queueManager.getQueue()[0]?.status).toBe('succeeded')
  })

  it('copies the finalized model beside the output audio when requested', async () => {
    const queueManager = createQueueManager()
    const outputAudioDirectory = `${mockPaths.userDataPath}/captures`
    const outputRootDir = `${mockPaths.userDataPath}/models`
    mkdirSync(outputAudioDirectory, { recursive: true })
    mkdirSync(outputRootDir, { recursive: true })

    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({
      copyFinalModelToOutputAudioFolder: true,
      outputAudioPath: `${outputAudioDirectory}/output.wav`,
      outputRootDir
    }))

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(
        `${args.outputRootDir}/model.nam`,
        JSON.stringify({
          version: '0.0.0',
          architecture: 'WaveNet',
          config: {},
          weights: [],
          metadata: {}
        }),
        'utf-8'
      )
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    const copiedModelPath = join(outputAudioDirectory, 'A2 Queued Diagnostics Job.nam')
    expect(runtime.status).toBe('succeeded')
    expect(runtime.publishedModelPath).toBe(copiedModelPath)
    expect(existsSync(copiedModelPath)).toBe(true)
    expect(readFileSync(copiedModelPath, 'utf-8')).toContain('WaveNet')
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(true)
  })

  it('does not publish a partial model after a failed training exit', async () => {
    const queueManager = createQueueManager()
    const outputAudioDirectory = join(mockPaths.userDataPath, 'captures')
    const outputRootDir = join(mockPaths.userDataPath, 'failed-models')
    mkdirSync(outputAudioDirectory, { recursive: true })
    mkdirSync(outputRootDir, { recursive: true })
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({
      copyFinalModelToOutputAudioFolder: true,
      outputAudioPath: join(outputAudioDirectory, 'output.wav'),
      outputRootDir
    }))

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      writeNamModel(join(args.outputRootDir, 'partial.nam'))
      hooks.onStarted(1234)
      hooks.onExit(1)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(existsSync(join(outputRootDir, 'partial.nam'))).toBe(true)
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
    expect(existsSync(join(outputAudioDirectory, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('does not bind a new job to a recent artifact in an older run directory', async () => {
    const queueManager = createQueueManager()
    const outputRootDir = join(mockPaths.userDataPath, 'shared-models')
    const olderRunDirectory = join(outputRootDir, '2020-01-01-00-00-00')
    mkdirSync(olderRunDirectory, { recursive: true })
    const olderModelPath = join(olderRunDirectory, 'older-model.nam')
    writeNamModel(olderModelPath)
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({ outputRootDir }))

    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(runtime.errorCategory).toBe('missing_model_artifact')
    expect(runtime.resolvedRunDirectory).toBeNull()
    expect(existsSync(olderModelPath)).toBe(true)
    expect(existsSync(join(olderRunDirectory, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('does not publish a pre-existing fresh model from a shared output root', async () => {
    const queueManager = createQueueManager()
    const outputRootDir = join(mockPaths.userDataPath, 'shared-root-models')
    mkdirSync(outputRootDir, { recursive: true })
    const existingModelPath = join(outputRootDir, 'existing-model.nam')
    writeNamModel(existingModelPath)
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({ outputRootDir }))

    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(runtime.errorCategory).toBe('missing_model_artifact')
    expect(existsSync(existingModelPath)).toBe(true)
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('cancels a job while latency preparation is still running', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    })
    queueManager.addToQueue(job)
    analyzeNamLatencyMock.mockImplementation(
      async (_settings, _inputPath, _outputPath, signal: AbortSignal) =>
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(analyzeNamLatencyMock).toHaveBeenCalledTimes(1)
    })
    await queueManager.cancelJob(job.id)
    await queuePromise

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('canceled')
    expect(runtime.errorCategory).toBe('stopped_by_user')
    expect(runNamFullMock).not.toHaveBeenCalled()
    expect(queueManager.getCurrentJob()).toBeNull()
  })

  it('finalizes a force-stopped job even when the PTY never emits an exit event', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec()
    const forceKill = vi.fn(async () => true)
    queueManager.addToQueue(job)
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      return {
        cancel: vi.fn(),
        forceKill,
        forceKillSync: vi.fn()
      }
    })

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(queueManager.getCurrentJob()?.status).toBe('running')
    })
    await queueManager.forceStopJob(job.id)
    await queuePromise

    const [runtime] = queueManager.getQueue()
    expect(forceKill).toHaveBeenCalledTimes(1)
    expect(runtime.status).toBe('canceled')
    expect(runtime.errorCategory).toBe('force_stopped')
    expect(runtime.pid).toBeNull()
    expect(queueManager.getCurrentJob()).toBeNull()
  })

  it('reports a terminal failure when process-tree termination cannot be confirmed', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec()
    queueManager.addToQueue(job)
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => false),
        forceKillSync: vi.fn()
      }
    })

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(queueManager.getCurrentJob()?.status).toBe('running')
    })
    await queueManager.forceStopJob(job.id)
    await queuePromise

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(runtime.errorCategory).toBe('force_stop_failed')
    expect(runtime.userMessages.at(-1)).toContain('Task Manager')
    expect(queueManager.getCurrentJob()).toBeNull()
  })

  it('uses one immutable backend settings snapshot for the complete run', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({
      outputRootDir: join(mockPaths.userDataPath, 'snapshot-models'),
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    })
    queueManager.addToQueue(job)

    let releaseLatencyAnalysis: () => void = () => undefined
    analyzeNamLatencyMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releaseLatencyAnalysis = resolve
      })
      return {
        ok: true,
        recommendedLatency: 12,
        inputVersion: '3.0.0',
        strongInputMatch: true,
        warnings: null,
        delays: [12],
        errorMessage: null,
        output: 'NAM_BOT_LATENCY_ANALYSIS={"ok":true}'
      }
    })
    runNamFullMock.mockImplementation(async (settings, args, hooks) => {
      expect(settings.environmentName).toBe(defaultSettings.environmentName)
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => true),
        forceKillSync: vi.fn()
      }
    })

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(analyzeNamLatencyMock).toHaveBeenCalledTimes(1)
    })
    queueManager.setSettings({
      ...defaultSettings,
      environmentName: 'different-environment'
    })
    releaseLatencyAnalysis()
    await queuePromise

    expect(runNamFullMock).toHaveBeenCalledTimes(1)
    expect(queueManager.getQueue()[0]?.status).toBe('succeeded')
  })

  it('marks workspace setup errors failed and clears the active job', async () => {
    const invalidWorkspaceRoot = join(mockPaths.userDataPath, 'workspace-file')
    writeFileSync(invalidWorkspaceRoot, 'not a directory', 'utf-8')
    const queueManager = new QueueManager()
    queueManager.setSettings({
      ...defaultSettings,
      defaultWorkspaceRoot: invalidWorkspaceRoot
    })
    queueManager.addToQueue(buildJobSpec())

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(queueManager.getCurrentJob()).toBeNull()
    expect(queueManager.isQueueProcessing()).toBe(false)
  })
})
