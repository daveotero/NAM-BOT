import { BrowserWindow, nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import { script, style } from 'virtual:training-report-assets'
import type { TrainingReportData, TrainingReportFormat } from '../../shared/training-report'

export function createTrainingReportHtml(data: TrainingReportData, format: TrainingReportFormat): string {
  const safeScript = script.replace(/<\/script/gi, '<\\/script')
  const hash = createHash('sha256').update(safeScript).digest('base64')
  const payload = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  return `<!doctype html><html lang="en" data-report-format="${format}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'">
<title>NAM-BOT Training Report</title><style>${style.replace(/<\/style/gi, '<\\/style')}</style></head>
<body><div id="root"></div><noscript>Enable JavaScript to view this offline training report.</noscript>
<script type="application/json" id="training-report-data">${payload}</script><script>${safeScript}</script></body></html>`
}

async function renderPng(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false, width: 1000, height: 1000, useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, partition: `training-report-${randomUUID()}` }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  const capture = async (): Promise<Buffer> => {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Navigation resets zoom for a new data URL; set it after load.
    window.webContents.setZoomFactor(1)
    while (await window.webContents.executeJavaScript('document.documentElement.dataset.reportReady') !== 'true') {
      await new Promise<void>(resolve => setTimeout(resolve, 30))
    }
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const height: unknown = await window.webContents.executeJavaScript('Math.ceil(document.querySelector(".training-report").getBoundingClientRect().height)')
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || height > 15000) throw new Error('Invalid training image dimensions.')
    window.setContentSize(1000, height)
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const image = await window.webContents.capturePage()
    if (image.isEmpty()) throw new Error('Training image capture was empty.')
    // capturePage includes the host display scale (e.g. 150% Windows DPI).
    // Flatten that representation before enforcing the portable 1000px width.
    return nativeImage.createFromBuffer(image.toPNG()).resize({ width: 1000, quality: 'best' }).toPNG()
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([capture(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Training image rendering timed out.')), 30_000)
    })])
  } finally {
    clearTimeout(timer)
    if (!window.isDestroyed()) window.destroy()
  }
}

// Serialize captures: multiple report requests must not compete for compositor resources.
let captureQueue: Promise<unknown> = Promise.resolve()

export async function writeTrainingReport(
  data: TrainingReportData, format: TrainingReportFormat, destination: string, overwrite = false
): Promise<string> {
  const html = createTrainingReportHtml(data, format)
  let contents: Buffer | string = html
  if (format === 'png') {
    const pending = captureQueue.then(() => renderPng(html))
    captureQueue = pending.catch(() => undefined)
    contents = await pending
  }
  await mkdir(dirname(destination), { recursive: true })
  let target = destination
  let reserved = false
  if (!overwrite) {
    for (let index = 1; ; index++) {
      const extension = extname(destination)
      target = index === 1 ? destination : `${destination.slice(0, -extension.length)} (${index})${extension}`
      try {
        const reservation = await open(target, 'wx')
        await reservation.close()
        reserved = true
        break
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
      }
    }
  }
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx')
    try { await file.writeFile(contents); await file.sync() } finally { await file.close() }
    await rename(temporary, target)
    return target
  } catch (error) {
    if (reserved) await unlink(target).catch(() => undefined)
    throw error
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
