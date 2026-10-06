import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultJobSpec } from '../../shared/training'
import { buildTrainingReportData } from '../../shared/training-report'

const mocks = vi.hoisted(() => ({ BrowserWindow: vi.fn(), createFromBuffer: vi.fn(), warn: vi.fn() }))
vi.mock('electron', () => ({ BrowserWindow: mocks.BrowserWindow, nativeImage: { createFromBuffer: mocks.createFromBuffer } }))
vi.mock('electron-log/main', () => ({ default: { warn: mocks.warn } }))
import { writeTrainingReport } from './training-report'

class ReportImage {
  constructor(private readonly empty: boolean = false) {}
  isEmpty(): boolean { return this.empty }
  toPNG(): Buffer { return Buffer.from('captured PNG') }
  resize = vi.fn((): ReportImage => this)
}

class ReportContents extends EventEmitter {
  destroyed = false
  paintAutomatically = true
  setWindowOpenHandler = vi.fn()
  setZoomFactor = vi.fn()
  capturePage = vi.fn(async (): Promise<ReportImage> => new ReportImage())
  executeJavaScript = vi.fn(async (script: string): Promise<string | number | undefined> => {
    if (script.includes('dataset.reportReady')) return 'true'
    if (script.includes('getBoundingClientRect')) return 800
    return undefined
  })
  invalidate = vi.fn((): void => {
    if (this.paintAutomatically) queueMicrotask(() => {
      if (!this.destroyed) this.emit('paint', {}, {}, new ReportImage())
    })
  })
  isDestroyed(): boolean { return this.destroyed }
}

class ReportWindow {
  webContents = new ReportContents()
  loadURL = vi.fn(async (): Promise<void> => undefined)
  setContentSize = vi.fn()
  isDestroyed(): boolean { return this.webContents.destroyed }
  destroy = vi.fn((): void => {
    this.webContents.destroyed = true
    this.webContents.emit('destroyed')
  })
}

let window: ReportWindow
let directory: string
let destination: string
const data = buildTrainingReportData({
  jobId: 'png-test', jobName: 'Capture', status: 'succeeded', pid: null,
  frozenJob: { ...defaultJobSpec, id: 'png-test', name: 'Capture', createdAt: '', updatedAt: '' }, userMessages: []
}, { appVersion: 'test', modelPath: null })

beforeEach(() => {
  vi.clearAllMocks()
  window = new ReportWindow()
  directory = mkdtempSync(join(tmpdir(), 'nam-report-png-'))
  destination = join(directory, 'Capture.training.png')
  mocks.BrowserWindow.mockImplementation(function (): ReportWindow { return window })
  mocks.createFromBuffer.mockImplementation((): ReportImage => new ReportImage())
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(directory, { recursive: true, force: true })
})

function expectCaptureCleanedUp(): void {
  expect(window.destroy).toHaveBeenCalledTimes(1)
  expect(window.webContents.listenerCount('paint')).toBe(0)
  expect(window.webContents.listenerCount('destroyed')).toBe(0)
}

describe('PNG report capture recovery', () => {
  it('waits for a nonempty fresh paint before capturing the resized report', async () => {
    window.webContents.paintAutomatically = false
    const pending = writeTrainingReport(data, 'png', destination)
    await vi.waitFor(() => expect(window.webContents.invalidate).toHaveBeenCalledTimes(1))
    expect(window.setContentSize).toHaveBeenCalledWith(1000, 800)
    expect(window.webContents.capturePage).not.toHaveBeenCalled()
    window.webContents.emit('paint', {}, {}, new ReportImage(true))
    expect(window.webContents.capturePage).not.toHaveBeenCalled()
    window.webContents.emit('paint', {}, {}, new ReportImage())
    await expect(pending).resolves.toBe(destination)
    expect(readFileSync(destination)).toEqual(Buffer.from('captured PNG'))
    expect(mocks.warn).not.toHaveBeenCalled()
    expectCaptureCleanedUp()
  })

  it('registers the paint listener before invalidating even for synchronous paint', async () => {
    window.webContents.invalidate.mockImplementation((): void => {
      window.webContents.emit('paint', {}, {}, new ReportImage())
    })
    await writeTrainingReport(data, 'png', destination)
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(1)
    expectCaptureCleanedUp()
  })

  it('repaints and recovers from two transient failures on the third attempt', async () => {
    window.webContents.capturePage.mockRejectedValueOnce(new Error('UnknownVizError'))
      .mockRejectedValueOnce(new Error('UnknownVizError'))
    await expect(writeTrainingReport(data, 'png', destination)).resolves.toBe(destination)
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(3)
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(3)
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(readFileSync(destination)).toEqual(Buffer.from('captured PNG'))
    expectCaptureCleanedUp()
  })

  it('recovers from an empty capture instead of writing an empty image', async () => {
    window.webContents.capturePage.mockResolvedValueOnce(new ReportImage(true))
    await expect(writeTrainingReport(data, 'png', destination)).resolves.toBe(destination)
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(2)
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(2)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expectCaptureCleanedUp()
  })

  it.each(['UnknownVizError', 'empty'])('stops after three persistent %s failures without creating a file', async (failure) => {
    if (failure === 'empty') window.webContents.capturePage.mockResolvedValue(new ReportImage(true))
    else window.webContents.capturePage.mockRejectedValue(new Error(failure))
    await expect(writeTrainingReport(data, 'png', destination)).rejects.toThrow('failed after 3 attempts')
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(3)
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(existsSync(destination)).toBe(false)
    expect(readdirSync(directory)).toEqual([])
    expectCaptureCleanedUp()
  })

  it('does not retry unknown errors or overwrite an existing file on capture failure', async () => {
    const failure = new Error('Renderer process crashed')
    writeFileSync(destination, 'existing image')
    window.webContents.capturePage.mockRejectedValue(failure)
    await expect(writeTrainingReport(data, 'png', destination, true)).rejects.toBe(failure)
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(1)
    expect(mocks.warn).not.toHaveBeenCalled()
    expect(readFileSync(destination, 'utf8')).toBe('existing image')
    expect(readdirSync(directory)).toEqual(['Capture.training.png'])
    expectCaptureCleanedUp()
  })

  it('allows the next queued export to succeed after a persistent capture failure', async () => {
    window.webContents.capturePage.mockRejectedValue(new Error('UnknownVizError'))
    const recoveredWindow = new ReportWindow()
    mocks.BrowserWindow.mockImplementationOnce(function (): ReportWindow { return window })
      .mockImplementationOnce(function (): ReportWindow { return recoveredWindow })
    const failed = writeTrainingReport(data, 'png', destination)
    const recoveredDestination = join(directory, 'Recovered.training.png')
    const recovered = writeTrainingReport(data, 'png', recoveredDestination)
    await expect(failed).rejects.toThrow('failed after 3 attempts')
    await expect(recovered).resolves.toBe(recoveredDestination)
    expect(existsSync(destination)).toBe(false)
    expect(readFileSync(recoveredDestination)).toEqual(Buffer.from('captured PNG'))
    expectCaptureCleanedUp()
    expect(recoveredWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the shared 30-second timeout while waiting for a repaint on retry', async () => {
    vi.useFakeTimers()
    window.webContents.capturePage.mockImplementation(async (): Promise<ReportImage> => {
      window.webContents.paintAutomatically = false
      throw new Error('UnknownVizError')
    })
    const pending = writeTrainingReport(data, 'png', destination)
    const rejected = expect(pending).rejects.toThrow('Training image rendering timed out.')
    await vi.advanceTimersByTimeAsync(0)
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    expect(window.webContents.capturePage).toHaveBeenCalledTimes(1)
    expect(existsSync(destination)).toBe(false)
    expectCaptureCleanedUp()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up immediately when the renderer is destroyed while waiting for paint', async () => {
    window.webContents.paintAutomatically = false
    const pending = writeTrainingReport(data, 'png', destination)
    const rejected = expect(pending).rejects.toThrow('Training image renderer was destroyed.')
    await vi.waitFor(() => expect(window.webContents.invalidate).toHaveBeenCalledTimes(1))
    window.destroy()
    await rejected
    expect(window.webContents.capturePage).not.toHaveBeenCalled()
    expectCaptureCleanedUp()
  })
})
