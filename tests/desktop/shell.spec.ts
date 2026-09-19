import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { A1_STANDARD_PRESET_ID, createTrainingPreset, defaultJobSpec, type JobRuntimeState } from '../../src/shared/training'

let app: ElectronApplication
let page: Page
let dataPath: string
let errors: string[]

test.beforeEach(async ({}, info) => {
  dataPath = await realpath(await mkdtemp(join(tmpdir(), 'nam-bot-shell-')))
  if (info.title.startsWith('lifetime dashboard')) {
    // Occasional users still see their latest runs, even outside the old 28-day window.
    const finishedAt = '2026-01-01T12:30:00.000Z'
    const startedAt = '2026-01-01T12:00:00.000Z'
    const runs: JobRuntimeState[] = Array.from({ length: 3 }, (_, index) => ({
      jobId: `history-${index}`, jobName: `Capture ${index}`, status: index === 2 ? 'failed' : 'succeeded', pid: null,
      frozenJob: { ...defaultJobSpec, id: `history-${index}`, name: `Capture ${index}`, createdAt: startedAt, updatedAt: startedAt },
      frozenPreset: createTrainingPreset({ id: 'test-preset', name: 'Studio capture' }),
      startedAt: new Date(Date.parse(startedAt) + index * 86_400_000).toISOString(),
      finishedAt: new Date(Date.parse(finishedAt) + index * 86_400_000).toISOString(),
      currentEpoch: 20, plannedEpochs: 100, userMessages: []
    }))
    await writeFile(join(dataPath, 'queue.json'), JSON.stringify(runs))
  }
  if (info.title.startsWith('Jobs search preserves')) {
    const now = new Date().toISOString()
    const runs: JobRuntimeState[] = ['Clean', 'Lead', 'Archive'].map((name, index) => ({
      jobId: `search-${index}`, jobName: name, status: index === 2 ? 'succeeded' : 'queued', pid: null,
      frozenJob: { ...defaultJobSpec, id: `search-${index}`, name, createdAt: now, updatedAt: now, inputAudioPath: 'input.wav', outputAudioPath: `${name}-capture.wav` },
      frozenPreset: createTrainingPreset({ id: `search-preset-${index}`, name: `${name} recipe` }),
      queuedAt: now, ...(index === 2 ? { startedAt: now, finishedAt: now } : {}), userMessages: []
    }))
    await writeFile(join(dataPath, 'queue.json'), JSON.stringify(runs))
  }
  const environment: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') environment[key] = value
  }
  environment.NAM_BOT_DESKTOP_SHELL_SMOKE = '1'
  environment.NAM_BOT_DESKTOP_SHELL_DATA = dataPath
  const scale = process.env.NAM_BOT_TEST_SCALE
  app = await electron.launch({
    ...(process.env.NAM_BOT_TEST_EXECUTABLE ? { executablePath: resolve(process.env.NAM_BOT_TEST_EXECUTABLE) } : {}),
    args: [...(process.env.NAM_BOT_TEST_EXECUTABLE ? [] : ['.']), ...(scale ? [`--force-device-scale-factor=${scale}`] : [])],
    env: environment
  })
  page = await app.firstWindow()
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.app-title-bar')).toBeVisible()
  await expect(page.locator('.app-title-bar-section')).toHaveText('Dashboard')
})

async function captureNativeWindow(info: TestInfo): Promise<void> {
  try {
    const capture = await app.evaluate(async ({ desktopCapturer, BrowserWindow, systemPreferences }) => {
      if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
        return { unavailable: 'Host screen recording permission not granted; native appearance unverified' }
      }
      const window = BrowserWindow.getAllWindows()[0]
      const source = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1800, height: 1200 } }))
        .find((entry) => entry.id === window.getMediaSourceId())
      return source && !source.thumbnail.isEmpty()
        ? { image: source.thumbnail.toPNG().toString('base64') }
        : { unavailable: 'Host did not supply a native window image' }
    })
    if (capture.image) {
      await writeFile(info.outputPath('native-window.png'), Buffer.from(capture.image, 'base64'))
      await info.attach('native-window', { body: Buffer.from(capture.image, 'base64'), contentType: 'image/png' })
      info.annotations.push({ type: 'native-appearance', description: 'Native window captured; visual review required' })
    } else {
      info.annotations.push({ type: 'native-appearance-unavailable', description: capture.unavailable ?? 'Capture unavailable' })
    }
  } catch (error) {
    info.annotations.push({ type: 'native-appearance-unavailable', description: String(error) })
  }
}

async function waitForPropertyScroll(): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    const editor = document.querySelector('.property-workspace')
    if (!editor) { resolve(); return }
    let lastTop = editor.scrollTop
    let stableFrames = 0
    const check = (): void => {
      stableFrames = Math.abs(editor.scrollTop - lastTop) < 0.5 ? stableFrames + 1 : 0
      lastTop = editor.scrollTop
      if (stableFrames >= 6) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }))
}

async function captureRenderer(info: TestInfo, filename: string): Promise<void> {
  await waitForPropertyScroll()
  // Electron's compositor may still hold the prior frame immediately after a
  // scroll or edit. Wait for paint, and use capturePage to honor application zoom.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await writeFile(info.outputPath(filename), Buffer.from(image, 'base64'))
}

test.afterEach(async ({}, info) => {
  if (page && !page.isClosed()) {
    await info.attach('renderer', { body: await page.screenshot({ path: info.outputPath('renderer.png') }), contentType: 'image/png' })
    await captureNativeWindow(info)
  }
  if (app) {
    await app.evaluate(() => { delete process.env.NAM_BOT_DESKTOP_SHELL_ACTIVE })
    await app.close()
  }
  try {
    await info.attach('application-log', { body: await readFile(join(dataPath, 'logs/nam-bot.log')), contentType: 'text/plain' })
  } catch { /* Launch failures may occur before logging initializes. */ }
  await writeFile(info.outputPath('verification.json'), JSON.stringify({
    platform: process.platform, packaged: Boolean(process.env.NAM_BOT_TEST_EXECUTABLE),
    dataPath, errors, annotations: info.annotations
  }, null, 2))
})

async function assertSafeArea(): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const bar = document.querySelector('.app-title-bar')!
    const safe = document.querySelector('.app-title-bar-safe-area')!.getBoundingClientRect()
    const wordmark = document.querySelector('.app-title-bar-wordmark')!.getBoundingClientRect()
    const section = document.querySelector('.app-title-bar-section')!.getBoundingClientRect()
    const rect = bar.getBoundingClientRect()
    const main = document.querySelector('main')!.getBoundingClientRect()
    const scale = Number(getComputedStyle(bar).getPropertyValue('--shell-scale'))
    const fullscreen = bar.getAttribute('data-fullscreen') === 'true'
    const platform = bar.getAttribute('data-platform')
    return {
      fits: section.right <= safe.right + 1 && wordmark.left >= safe.left && section.left > wordmark.right,
      // Windows includes the native top resize border; rounding also varies by DPI.
      height: Math.abs(rect.height / scale - 44) <= 1.25,
      below: main.top >= rect.bottom,
      macSafe: platform !== 'darwin' || fullscreen || wordmark.left / scale >= 90,
      windowsSafe: platform !== 'win32' || fullscreen || (window.innerWidth - safe.right) / scale >= 120,
      fullscreenSafe: !fullscreen || Math.abs(safe.width - window.innerWidth) < 2
    }
  })).toEqual({ fits: true, height: true, below: true, macSafe: true, windowsSafe: true, fullscreenSafe: true })
}

test('isolated launch, preload, fixed header, zoom, resize and fullscreen', async () => {
  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(dataPath)
  expect(await page.evaluate(() => ({ require: typeof Reflect.get(window, 'require'), process: typeof Reflect.get(window, 'process') })))
    .toEqual({ require: 'undefined', process: 'undefined' })
  await expect(page).toHaveTitle('Dashboard — NAM-BOT')
  await expect(page.locator('.app-title-bar [role="status"]')).toHaveCount(0)
  await expect(page.locator('.status-current-job')).toContainText('Idle')
  await assertSafeArea()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700))
  for (const zoom of [0.75, 1, 1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom)
    await assertSafeArea()
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true))
  await expect(page.locator('.app-title-bar')).toHaveAttribute('data-fullscreen', 'true')
  await assertSafeArea()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false))
  await expect(page.locator('.app-title-bar')).toHaveAttribute('data-fullscreen', 'false')
  await assertSafeArea()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  expect(errors).toEqual([])
})

test('native window lifecycle and application menu commands', async () => {
  const window = await app.browserWindow(page)
  await window.evaluate((win) => win.minimize())
  await expect.poll(() => window.evaluate((win) => win.isMinimized())).toBe(true)
  await window.evaluate((win) => { win.restore(); win.show(); win.focus() })
  await expect(page.locator('.app-title-bar')).toHaveAttribute('data-focused', 'true')
  await window.evaluate((win) => win.maximize())
  await expect.poll(() => window.evaluate((win) => win.isMaximized())).toBe(true)
  await assertSafeArea()
  await window.evaluate((win) => win.unmaximize())
  await expect.poll(() => window.evaluate((win) => win.isMaximized())).toBe(false)
  if (process.platform === 'win32') {
    expect(await window.evaluate((win) => win.isMenuBarVisible())).toBe(false)
    const button = page.getByRole('button', { name: 'Application menu' })
    // Close via Electron because Playwright keys do not drive OS popup menus.
    for (const [name, open] of Object.entries({ Mouse: () => button.click(), F10: () => page.keyboard.press('F10'), NativeF10: () => window.evaluate((win) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F10' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F10' })
    }), Enter: () => button.press('Enter'), Space: () => button.press('Space') })) {
      await test.step(`Menu via ${name}`, async () => {
        await window.evaluate((win) => win.focus())
        await open()
        await expect(button).toHaveAttribute('aria-expanded', 'true')
        await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.closePopup())
        await expect(button).toHaveAttribute('aria-expanded', 'false')
        await expect(button).toBeFocused()
      })
    }
    await page.keyboard.press('Alt')
    expect(await window.evaluate((win) => win.isMenuBarVisible())).toBe(false)
  }
  await app.evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()!.items.find((entry) => entry.label === 'Navigate')!.submenu!.items.find((entry) => entry.label === 'Jobs')!
    item.click(undefined, BrowserWindow.getAllWindows()[0], undefined)
  })
  await expect(page.locator('.app-title-bar-section')).toHaveText('Jobs')
  await expect(page).toHaveTitle('Jobs — NAM-BOT')
  // Exercise the registered native accelerator, in addition to menu closures.
  await window.evaluate((win) => {
    const modifiers = [process.platform === 'darwin' ? 'meta' : 'control']
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '1', modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '1', modifiers })
  })
  await expect(page.locator('.app-title-bar-section')).toHaveText('Dashboard')
  if (process.platform === 'win32') {
    await window.evaluate((win) => win.webContents.setZoomFactor(1.5))
    await assertSafeArea()
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()!
      const popup = menu.popup.bind(menu)
      menu.popup = (options): void => {
        Reflect.set(globalThis, 'shellTestPopupPoint', { x: options?.x, y: options?.y })
        popup(options)
      }
    })
    const button = page.getByRole('button', { name: 'Application menu' })
    const expected = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: Math.round(rect.left * 1.5), y: Math.round(rect.bottom * 1.5) }
    })
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(await app.evaluate(() => Reflect.get(globalThis, 'shellTestPopupPoint'))).toEqual(expected)
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.closePopup())
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await window.evaluate((win) => win.webContents.setZoomFactor(1))
  }
  expect(errors).toEqual([])
})

async function chooseMenu(top: string, label: string): Promise<void> {
  await app.evaluate(({ Menu, BrowserWindow }, selection) => {
    const item = Menu.getApplicationMenu()!.items.find((entry) => entry.label === selection.top)!.submenu!.items.find((entry) => entry.label === selection.label || entry.role === selection.label)!
    item.click(undefined, BrowserWindow.getAllWindows()[0], undefined)
  }, { top, label })
}

test('dashboard command and status bar preserve unsaved editor navigation', async () => {
  await expect(page.locator('.workspace-toolbar').getByRole('button', { name: 'New job' })).toHaveText('New job')
  await expect(page.locator('.workspace-toolbar').getByRole('button', { name: 'New job' })).toHaveAttribute('title', process.platform === 'darwin' ? 'New job (⌘N)' : 'New job (Ctrl+N)')
  await page.locator('.workspace-toolbar').getByRole('button', { name: 'New job' }).click()
  await page.locator('#job-name').fill('Unsaved status-bar navigation')
  await page.locator('.status-backend').click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await expect(page.locator('#job-name')).toHaveValue('Unsaved status-bar navigation')
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Discard and Leave', exact: true }).click()
  await expect(page.getByLabel('Diagnostics summary')).toBeVisible()
  await page.locator('.status-queue').click()
  await expect(page.locator('.app-title-bar-section')).toHaveText('Jobs')
  expect(errors).toEqual([])
})

test('Jobs toolbar saves drafts and creates batches without losing editor actions', async ({}, info) => {
  await chooseMenu('Navigate', 'Jobs')
  const toolbar = page.locator('.workspace-toolbar')
  const search = page.getByRole('searchbox', { name: 'Search jobs' })
  await expect(search).toBeVisible()
  await expect(page.locator('.jobs-empty')).toBeVisible()
  await search.fill('no existing jobs')
  await toolbar.getByRole('button', { name: 'New Job', exact: true }).click()
  await page.locator('#job-name').fill('Workspace draft')
  const output = join(dataPath, 'capture.wav')
  const secondOutput = join(dataPath, 'capture-2.wav')
  await writeFile(output, Buffer.alloc(44))
  await writeFile(secondOutput, Buffer.alloc(44))
  await page.locator('#output-audio-path').fill(output)
  await expect(toolbar.getByRole('button', { name: 'Save Job', exact: true })).toBeEnabled()
  await page.locator('.job-editor-workspace').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(toolbar).toBeInViewport()
  await toolbar.getByRole('button', { name: 'Save Job', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.locator('.draft-card h4')).toHaveText('Workspace draft')
  await search.fill('  WORKSPACE  ')
  await expect(page.locator('.draft-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Queue All', exact: true })).toBeDisabled()
  await expect(page.locator('.draft-card').getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
  await search.fill('no match')
  await expect(page.getByText('No matching jobs.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.locator('.draft-card').getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.locator('.draft-card')).toHaveCount(2)

  const picker = page.waitForEvent('filechooser')
  await toolbar.getByRole('button', { name: 'Add audio files', exact: true }).click()
  await (await picker).setFiles([output, secondOutput])
  await expect(page.getByLabel('Batch Label', { exact: false })).toBeVisible()
  await toolbar.getByRole('button', { name: 'Create Batch', exact: true }).click()
  await expect(page.locator('.draft-card')).toHaveCount(4)
  await page.screenshot({ path: info.outputPath('jobs-drafts.png') })
  expect(errors).toEqual([])
})

test('job properties align inputs, preview filenames, and preserve edits through save', async ({}, info) => {
  await chooseMenu('File', 'New Job')
  const sections = page.getByRole('navigation', { name: 'Job editor sections' })
  await expect(sections.getByRole('button', { name: 'Name & audio', exact: true })).toHaveAttribute('aria-current', 'location')
  const output = join(dataPath, '6534 Pedals.wav')
  await writeFile(output, Buffer.alloc(44))
  await page.locator('#output-audio-path').fill(output)
  await page.getByRole('region', { name: 'Name & audio', exact: true }).getByRole('button', { name: 'Use Output Filename' }).click()
  await expect(page.locator('#job-name')).toHaveValue('6534 Pedals')
  const preview = page.getByLabel('Filename preview', { exact: true })
  await expect(preview).toHaveText('6534 Pedals.nam')
  await page.getByLabel('Append preset name', { exact: true }).check()
  await page.locator('#preset-select').selectOption(A1_STANDARD_PRESET_ID)
  await expect(preview).toHaveText('6534 Pedals - Standard WaveNet.nam')
  await page.getByLabel('Append final ESR', { exact: true }).check()
  await expect(preview).toHaveText('6534 Pedals - Standard WaveNet - ESR [pending].nam')
  await page.locator('#epochs').fill('42')
  await page.getByRole('group', { name: 'Latency mode' }).getByRole('button', { name: 'Manual', exact: true }).click()
  await page.locator('#latency-samples').fill('128')
  await page.locator('#meta-name').fill('Embedded label')
  await expect(preview).toHaveText('6534 Pedals - Standard WaveNet - ESR [pending].nam')

  await sections.getByRole('button', { name: 'Metadata', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#job-metadata-heading')).toBeFocused()
  await expect(sections.getByRole('button', { name: 'Metadata', exact: true })).toHaveAttribute('aria-current', 'location')
  await expect.poll(() => page.evaluate(() => {
    const name = document.querySelector('#meta-name')!.getBoundingClientRect()
    const author = document.querySelector('#meta-modeled-by')!.getBoundingClientRect()
    return Math.abs(name.top - author.top) < 1 && Math.abs(name.height - author.height) < 1
  })).toBe(true)
  await page.locator('#meta-name').focus()
  await page.keyboard.press('Tab')
  const useName = page.getByRole('region', { name: 'Metadata', exact: true }).getByRole('button', { name: 'Use Output Filename' })
  await expect(useName).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#meta-name')).toHaveValue('6534 Pedals')
  await page.keyboard.press('Tab')
  await expect(page.locator('#meta-modeled-by')).toBeFocused()
  await page.locator('#meta-modeled-by').fill('Dave Otero')
  await captureRenderer(info, 'job-metadata-alignment.png')
  await sections.getByRole('button', { name: 'Model output', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#job-model-output-heading')).toBeFocused()
  await expect(sections.getByRole('button', { name: 'Model output', exact: true })).toHaveAttribute('aria-current', 'location')
  await expect.poll(() => page.evaluate(() => {
    const label = document.querySelector('#model-filename-preview-label')!.getBoundingClientRect()
    const filename = document.querySelector('.model-filename-output')!.getBoundingClientRect()
    return filename.left > label.right && Math.abs(filename.top - label.top) < 8
  })).toBe(true)
  await captureRenderer(info, 'job-model-output.png')
  await sections.getByRole('button', { name: 'Name & audio', exact: true }).click()
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Name & audio', exact: true })).toHaveAttribute('aria-current', 'location')
  await captureRenderer(info, 'job-audio-training.png')
  await sections.getByRole('button', { name: 'Training', exact: true }).click()
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Training', exact: true })).toHaveAttribute('aria-current', 'location')
  await page.locator('.job-editor-workspace').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(sections.getByRole('button', { name: 'Metadata', exact: true })).toHaveAttribute('aria-current', 'location')
  await page.locator('.job-editor-workspace').evaluate(element => { element.scrollTop = 0 })
  await expect(sections.getByRole('button', { name: 'Name & audio', exact: true })).toHaveAttribute('aria-current', 'location')
  await expect(sections.locator('[aria-current]')).toHaveCount(1)
  await page.locator('.workspace-toolbar').getByRole('button', { name: 'Save Job', exact: true }).click()
  await page.locator('.draft-card').getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(preview).toHaveText('6534 Pedals - Standard WaveNet - ESR [pending].nam')
  await expect(page.locator('#epochs')).toHaveValue('42')
  await expect(page.locator('#latency-samples')).toHaveValue('128')
  await expect(page.locator('#meta-modeled-by')).toHaveValue('Dave Otero')
  await expect(page.locator('.workspace-toolbar').getByRole('button', { name: 'Save Job', exact: true })).toBeDisabled()

  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await assertSafeArea()
  await sections.getByRole('button', { name: 'Metadata', exact: true }).click()
  await waitForPropertyScroll()
  await expect.poll(() => page.locator('.job-editor-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await expect(useName).toBeInViewport()
  await expect(sections.getByRole('button', { name: 'Metadata', exact: true })).toHaveAttribute('aria-current', 'location')
  await captureRenderer(info, 'job-metadata-small.png')
  await sections.getByRole('button', { name: 'Model output', exact: true }).click()
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Model output', exact: true })).toHaveAttribute('aria-current', 'location')
  await captureRenderer(info, 'job-model-output-small.png')
  await sections.getByRole('button', { name: 'Name & audio', exact: true }).click()
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Name & audio', exact: true })).toHaveAttribute('aria-current', 'location')
  await captureRenderer(info, 'job-audio-small.png')
  expect(errors).toEqual([])
})

test('property section navigation animates, tracks manual scrolling, and respects reduced motion', async () => {
  await chooseMenu('File', 'New Job')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const editor = page.locator('.property-workspace')
  const sections = page.getByRole('navigation', { name: 'Job editor sections' })
  await editor.evaluate(element => {
    element.setAttribute('data-scroll-samples', '[]')
    element.addEventListener('scroll', () => {
      const samples: number[] = JSON.parse(element.getAttribute('data-scroll-samples') || '[]')
      samples.push(element.scrollTop)
      element.setAttribute('data-scroll-samples', JSON.stringify(samples))
    })
  })
  await sections.getByRole('button', { name: 'Metadata', exact: true }).click()
  await waitForPropertyScroll()
  expect(await editor.evaluate(element => new Set(JSON.parse(element.getAttribute('data-scroll-samples') || '[]')).size)).toBeGreaterThan(3)
  await expect(sections.getByRole('button', { name: 'Metadata', exact: true })).toHaveAttribute('aria-current', 'location')
  await page.locator('#job-metadata-heading').press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home')
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Name & audio', exact: true })).toHaveAttribute('aria-current', 'location')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await editor.evaluate(element => element.setAttribute('data-scroll-samples', '[]'))
  await sections.getByRole('button', { name: 'Metadata', exact: true }).click()
  await waitForPropertyScroll()
  expect(await editor.evaluate(element => new Set(JSON.parse(element.getAttribute('data-scroll-samples') || '[]')).size)).toBeLessThanOrEqual(2)
  await expect(page.locator('#job-metadata-heading')).toBeFocused()
  expect(errors).toEqual([])
})

test('Jobs search preserves frozen presets, queue positions, and hidden jobs', async ({}, info) => {
  await chooseMenu('Navigate', 'Jobs')
  const search = page.getByRole('searchbox', { name: 'Search jobs' })
  await expect(page.locator('#jobs-queue .job-card')).toHaveCount(2)
  await search.fill(' LEAD RECIPE ')
  await expect(page.locator('#jobs-queue .job-card')).toHaveCount(1)
  await expect(page.getByText('Waiting in queue - 2 of 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unqueue All', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Unqueue', exact: true })).toBeEnabled()
  await expect(page.locator('#jobs-queue .job-card')).not.toHaveAttribute('role', 'button')
  await captureRenderer(info, 'jobs-search.png')
  await search.fill('Clean-capture.wav')
  await expect(page.getByText('Next to train - 1 of 2', { exact: true })).toBeVisible()
  await search.fill('archive')
  await expect(page.locator('#jobs-finished .job-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Clear Finished', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.namBot.jobs.listQueue())).toEqual(['search-0', 'search-1', 'search-2'].map(jobId => expect.objectContaining({ jobId })))
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unqueue All', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Clear Finished', exact: true })).toBeEnabled()
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await expect(search).toBeInViewport()
  await expect.poll(() => page.locator('.jobs-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await captureRenderer(info, 'jobs-search-small.png')
  expect(errors).toEqual([])
})

test('preset property sections preserve overrides, import mode, and edits', async ({}, info) => {
  await chooseMenu('File', 'New Preset')
  const toolbar = page.locator('.workspace-toolbar')
  const sections = page.getByRole('navigation', { name: 'Preset editor sections' })
  await page.locator('#preset-name').fill('Property sheet preset')
  await page.locator('#preset-author-name').fill('Studio author')
  const modeControls = toolbar.getByRole('group', { name: 'Preset editor mode' })
  await expect(toolbar.locator('.workspace-heading-group').getByRole('group', { name: 'Preset editor mode' })).toBeVisible()
  const primaryAction = toolbar.locator('.preset-primary-action')
  await primaryAction.evaluate(element => element.setAttribute('data-stable-action', 'original'))
  const manualActionBox = await primaryAction.boundingBox()
  const manualControlsBox = await modeControls.boundingBox()
  await modeControls.getByRole('button', { name: 'Import JSON', exact: true }).click()
  await expect(primaryAction).toHaveText('Apply JSON')
  await expect(primaryAction).toBeDisabled()
  await expect(primaryAction).toHaveAttribute('data-stable-action', 'original')
  expect(await primaryAction.boundingBox()).toEqual(manualActionBox)
  expect(await modeControls.boundingBox()).toEqual(manualControlsBox)
  await captureRenderer(info, 'preset-import-toolbar.png')
  await modeControls.getByRole('button', { name: 'Manual Editor', exact: true }).click()
  await expect(primaryAction).toHaveText('Save Preset')
  await expect(page.locator('#preset-name')).toHaveValue('Property sheet preset')
  await sections.getByRole('button', { name: 'Architecture', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#preset-architecture-section-heading')).toBeFocused()
  await page.locator('#preset-architecture-version').selectOption('a1')
  await sections.getByRole('button', { name: 'Training', exact: true }).click()
  await waitForPropertyScroll()
  await page.locator('#preset-epochs').fill('42')
  await page.locator('#preset-batch-size').fill('32')
  await captureRenderer(info, 'preset-training.png')
  await sections.getByRole('button', { name: 'Overrides', exact: true }).click()
  await waitForPropertyScroll()
  await page.locator('#preset-learning-json').fill('{')
  await expect(toolbar.getByRole('button', { name: 'Save Preset', exact: true })).toBeDisabled()
  await page.locator('#preset-learning-json').fill('{"trainer":{"max_epochs":77}}')
  await expect(page.locator('#preset-epochs')).toBeDisabled()
  await expect(page.locator('#preset-epochs')).toHaveValue('77')
  await captureRenderer(info, 'preset-overrides.png')
  await toolbar.getByRole('button', { name: 'Import JSON', exact: true }).click()
  await page.locator('#import-preset-json').fill('{"learning":{"trainer":{"max_epochs":88}}}')
  await toolbar.getByRole('button', { name: 'Apply JSON', exact: true }).click()
  await expect(page.locator('#preset-name')).toHaveValue('Property sheet preset')
  await expect(page.locator('#preset-author-name')).toHaveValue('Studio author')
  await expect(page.locator('#preset-epochs')).toHaveValue('88')
  await sections.getByRole('button', { name: 'Preset', exact: true }).click()
  await captureRenderer(info, 'preset-information.png')
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await sections.getByRole('button', { name: 'Training', exact: true }).click()
  await waitForPropertyScroll()
  await expect.poll(() => page.locator('.property-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await captureRenderer(info, 'preset-training-small.png')
  await toolbar.getByRole('button', { name: 'Save Preset', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Property sheet preset', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('Diagnostics and Setup Guide share section navigation and command styling', async ({}, info) => {
  await chooseMenu('Navigate', 'Diagnostics')
  const toolbar = page.locator('.workspace-toolbar')
  const diagnosticsNav = page.getByRole('navigation', { name: 'Diagnostics sections' })
  await expect(toolbar.getByRole('heading', { name: 'Diagnostics', exact: true })).toHaveCount(1)
  await expect(diagnosticsNav.getByRole('button')).toHaveText(['Overview', 'Actions', 'Checks', 'Details'])
  await diagnosticsNav.getByRole('button', { name: 'Actions', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#diagnostics-actions-heading')).toBeFocused()
  await expect(page.getByText('Conda is not reachable', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string): Promise<void> => { document.body.dataset.copiedCommand = text } })
  })
  await page.getByRole('button', { name: 'Copy Find Conda', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-copied-command', process.platform === 'win32' ? 'where conda' : 'which conda')
  await captureRenderer(info, 'diagnostics-actions.png')
  await diagnosticsNav.getByRole('button', { name: 'Checks', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#diagnostics-checks-heading')).toBeFocused()
  await expect(diagnosticsNav.getByRole('button', { name: 'Checks', exact: true })).toHaveCSS('background-color', 'rgb(48, 48, 55)')
  await captureRenderer(info, 'diagnostics-checks.png')
  await diagnosticsNav.getByRole('button', { name: 'Details', exact: true }).click()
  await waitForPropertyScroll()
  await page.getByRole('button', { name: 'Show Details', exact: true }).click()
  await page.getByRole('button', { name: 'Show Raw JSON', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copy Raw Diagnostics JSON', exact: true })).toBeVisible()
  await toolbar.getByRole('button', { name: 'Re-check All', exact: true }).click()
  await expect(toolbar.getByRole('button', { name: 'Re-check All', exact: true })).toBeEnabled()
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await diagnosticsNav.getByRole('button', { name: 'Checks', exact: true }).click()
  await waitForPropertyScroll()
  await expect.poll(() => page.locator('.property-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await captureRenderer(info, 'diagnostics-checks-small.png')

  // Set zoom independently on each route: Electron CDP can retain stale input
  // scaling after a hash navigation while zoomed, despite correct DOM hit regions.
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1400, 950); window.webContents.setZoomFactor(1) })
  await chooseMenu('Help', 'Setup Guide')
  const guideNav = page.getByRole('navigation', { name: 'Setup guide sections' })
  await expect(guideNav.getByRole('button')).toHaveText(['Existing setup', 'New environment', 'Links'])
  await guideNav.getByRole('button', { name: 'New environment', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#guide-new-heading')).toBeFocused()
  await page.getByRole('button', { name: /^NVIDIA CUDA/ }).click()
  await expect(page.getByRole('button', { name: /^NVIDIA CUDA/ })).toHaveAttribute('aria-pressed', 'true')
  await guideNav.getByRole('button', { name: 'New environment', exact: true }).click()
  await captureRenderer(info, 'setup-guide.png')
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await guideNav.getByRole('button', { name: 'New environment', exact: true }).click()
  await expect.poll(() => page.locator('.property-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await captureRenderer(info, 'setup-guide-small.png')
  await guideNav.getByRole('button', { name: 'Links', exact: true }).click()
  await waitForPropertyScroll()
  await expect(page.locator('#guide-links-heading')).toBeFocused()
  await expect(guideNav.getByRole('button', { name: 'Links', exact: true })).toHaveAttribute('aria-current', 'location')
  expect(errors).toEqual([])
})

test('settings property sections retain auto-save, browsing, validation, and defaults', async ({}, info) => {
  await chooseMenu('Navigate', 'Settings')
  const toolbar = page.locator('.workspace-toolbar')
  const sections = page.getByRole('navigation', { name: 'Settings sections' })
  await expect(toolbar.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(1)
  await page.locator('#settings-backend-mode').selectOption('conda-prefix')
  await page.locator('#settings-environment-prefix').fill(join(dataPath, 'environment'))
  await page.locator('#settings-backend-mode').selectOption('conda-name')
  await page.locator('#settings-environment-name').fill('property-smoke')
  await page.getByRole('button', { name: 'Validate Backend', exact: true }).click()
  await captureRenderer(info, 'settings-backend.png')
  await sections.getByRole('button', { name: 'Folders', exact: true }).click()
  await waitForPropertyScroll()
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, dataPath)
  await page.getByRole('region', { name: 'Folders', exact: true }).getByRole('button', { name: 'Browse', exact: true }).first().click()
  await expect(page.locator('#settings-output-root')).toHaveValue(dataPath)
  await sections.getByRole('button', { name: 'Author', exact: true }).click()
  await waitForPropertyScroll()
  await expect(sections.getByRole('button', { name: 'Author', exact: true })).toHaveAttribute('aria-current', 'location')
  await page.locator('#settings-author-name').fill('Property sheet author')
  await page.locator('#settings-author-url').fill('https://example.com/studio')
  await page.getByLabel('Automatically open results folder after training').check()
  await expect(toolbar.getByRole('status')).toHaveText('Saved')
  await captureRenderer(info, 'settings-defaults.png')
  await chooseMenu('Navigate', 'Jobs')
  await expect(page.locator('.app-title-bar-section')).toHaveText('Jobs')
  await chooseMenu('Navigate', 'Settings')
  await expect(page.locator('#settings-environment-name')).toHaveValue('property-smoke')
  await expect(page.locator('#settings-output-root')).toHaveValue(dataPath)
  await expect(page.locator('#settings-author-name')).toHaveValue('Property sheet author')
  await expect(page.getByLabel('Automatically open results folder after training')).toBeChecked()
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await sections.getByRole('button', { name: 'Folders', exact: true }).click()
  await waitForPropertyScroll()
  await expect.poll(() => page.locator('.property-workspace').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await expect(toolbar.getByRole('button', { name: 'Save Settings', exact: true })).toBeInViewport()
  await captureRenderer(info, 'settings-folders-small.png')
  expect(errors).toEqual([])
})

test('batch filename previews follow each audio file and ignore the shared batch label', async () => {
  await chooseMenu('Navigate', 'Jobs')
  const first = join(dataPath, 'Clean.wav')
  const second = join(dataPath, 'Drive.wav')
  await writeFile(first, Buffer.alloc(44))
  await writeFile(second, Buffer.alloc(44))
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.workspace-toolbar').getByRole('button', { name: 'Add audio files', exact: true }).click()
  await (await chooser).setFiles([first, second])
  await page.getByLabel('Batch Label', { exact: false }).fill('Studio session')
  await expect(page.locator('.model-filename-output > span')).toHaveText(['Clean.nam', 'Drive.nam'])
  await page.getByLabel('Append final ESR', { exact: true }).check()
  await expect(page.locator('.model-filename-output > span')).toHaveText(['Clean - ESR [pending].nam', 'Drive - ESR [pending].nam'])
  await page.locator('.workspace-toolbar').getByRole('button', { name: 'Create Batch', exact: true }).click()
  await expect(page.locator('.draft-card h4')).toHaveCount(2)
  expect((await page.locator('.draft-card h4').allTextContents()).sort()).toEqual(['Clean', 'Drive'])
  expect(errors).toEqual([])
})

test('Presets filters, fixed editor actions and file round-trip remain functional', async ({}, info) => {
  await chooseMenu('Navigate', 'Presets')
  const toolbar = page.locator('.workspace-toolbar')
  const rows = page.locator('.preset-library-row')
  await expect(rows).toHaveCount(7)
  await page.getByRole('group', { name: 'Preset architecture' }).getByRole('button', { name: 'A2', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await page.getByRole('searchbox', { name: 'Search presets' }).fill('Heavy')
  // The Ultra description also includes Heavy; search covers descriptions as well as names.
  await expect(rows).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search presets' }).fill('Heavy 12')
  await expect(rows).toHaveCount(1)
  await rows.first().focus()
  await page.keyboard.press('Space')
  await expect(rows.first()).toHaveAttribute('aria-expanded', 'true')
  await expect(rows.first().getByRole('button', { name: 'Copy Preset JSON' })).toBeVisible()
  await rows.first().getByRole('button', { name: 'Customize', exact: true }).click()
  await page.locator('#preset-name').fill('Workspace preset')
  await captureRenderer(info, 'preset-editor.png')
  await page.locator('.preset-editor-workspace').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(toolbar).toBeInViewport()
  await toolbar.getByRole('button', { name: 'Save Preset', exact: true }).click()
  await expect(rows).toHaveCount(8)
  const saved = rows.filter({ has: page.getByRole('heading', { name: 'Workspace preset', exact: true }) })
  const exportPath = join(dataPath, 'workspace-preset.json')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, exportPath)
  await saved.getByRole('button', { name: 'Export', exact: true }).click()
  await expect.poll(async () => {
    try { return JSON.parse(await readFile(exportPath, 'utf8')).name } catch { return null }
  }).toBe('Workspace preset')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, exportPath)
  await toolbar.getByRole('button', { name: 'Import Preset', exact: true }).click()
  await expect(rows).toHaveCount(9)
  await expect(saved).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search presets' }).fill('no-matching-preset')
  await expect(page.getByText('No matching presets.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(rows).toHaveCount(9)
  await page.screenshot({ path: info.outputPath('presets-library.png') })
  expect(errors).toEqual([])
})

test('menu navigation protects unsaved job, batch and preset editors', async () => {
  await chooseMenu('File', 'New Job')
  await page.locator('#job-name').fill('Uncommitted shell test')
  await chooseMenu('Navigate', 'Settings')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await expect(page.locator('#job-name')).toHaveValue('Uncommitted shell test')
  await chooseMenu('File', 'New Preset')
  await page.getByRole('button', { name: 'Discard and Leave', exact: true }).click()
  await page.locator('#preset-name').fill('Unsaved preset')
  await chooseMenu('Navigate', 'Jobs')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await expect(page.locator('#preset-name')).toHaveValue('Unsaved preset')
  await chooseMenu('Navigate', 'Jobs')
  await page.getByRole('button', { name: 'Discard and Leave', exact: true }).click()
  const wav = join(dataPath, 'batch-output.wav')
  const secondWav = join(dataPath, 'batch-output-2.wav')
  await writeFile(wav, Buffer.alloc(44))
  await writeFile(secondWav, Buffer.alloc(44))
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'CLICK TO BROWSE FILES' }).click()
  await (await picker).setFiles([wav, secondWav])
  await expect(page.getByLabel('Batch Label', { exact: false })).toBeVisible()
  await chooseMenu('Navigate', 'Dashboard')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await expect(page.getByLabel('Batch Label', { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})

test('window close and quit can be canceled during simulated training', async () => {
  await app.evaluate(() => {
    process.env.NAM_BOT_DESKTOP_SHELL_ACTIVE = '1'
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect(page.getByRole('dialog', { name: 'Training is still running' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep Training', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.evaluate(({ app }) => app.quit())
  await page.getByRole('button', { name: 'Keep Training', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await chooseMenu(process.platform === 'darwin' ? await app.evaluate(({ app }) => app.name) : 'File', 'quit')
  await page.getByRole('button', { name: 'Keep Training', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await page.getByRole('button', { name: 'Keep Training', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.app-title-bar')).toBeVisible()
})

test('blank new jobs cancel quietly after default audio loads; actual and reverted edits are distinguished', async () => {
  await chooseMenu('Navigate', 'Jobs')
  const toolbar = page.locator('.workspace-toolbar')
  await toolbar.getByRole('button', { name: 'New Job', exact: true }).click()
  await expect(page.locator('#input-audio-path')).not.toHaveValue('')
  await toolbar.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('#job-name')).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await toolbar.getByRole('button', { name: 'New Job', exact: true }).click()
  const original = await page.locator('#job-name').inputValue()
  await page.locator('#job-name').fill('Actual entry')
  await toolbar.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await page.locator('#job-name').fill(original)
  await toolbar.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('#job-name')).toHaveCount(0)
  await toolbar.getByRole('button', { name: 'New Job', exact: true }).click()
  await expect(page.locator('#input-audio-path')).not.toHaveValue('')
  await chooseMenu('Navigate', 'Settings')
  await expect(page.locator('.app-title-bar-section')).toHaveText('Settings')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(toolbar.getByRole('button', { name: 'Save Settings', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})

test('lifetime dashboard retains statistics after clearing job history', async ({}, info) => {
  const panel = page.getByRole('region', { name: 'Lifetime training statistics' })
  await expect(panel.locator('.training-totals > div').nth(0).locator('dd')).toHaveText('2')
  await expect(panel.locator('.training-totals > div').nth(1).locator('dd')).toHaveText('1.5 h')
  await expect(panel.locator('.training-totals > div').nth(2).locator('dd')).toHaveText('40')
  await expect(panel.locator('.training-favorite')).toHaveText('Studio capture')
  const recentRuns = panel.getByRole('table', { name: 'Recent completed runs' })
  await expect(recentRuns.locator('tbody tr')).toHaveCount(2)
  await expect(recentRuns.locator('.recent-training-name')).toHaveText(['Capture 1', 'Capture 0'])
  await expect(recentRuns.locator('tbody tr').first()).toContainText('Studio capture')
  await expect(recentRuns.locator('tbody tr').first()).toContainText('30m 0s')
  await captureRenderer(info, 'dashboard-statistics.png')
  await page.evaluate(async () => { await window.namBot.jobs.clearFinished() })
  await page.reload()
  await expect(panel.locator('.training-totals > div').nth(0).locator('dd')).toHaveText('2')
  await expect(recentRuns.locator('.recent-training-name')).toHaveText(['Capture 1', 'Capture 0'])
  expect(await page.evaluate(() => window.namBot.jobs.listQueue())).toEqual([])
  const saved = JSON.parse(await readFile(join(dataPath, 'training-statistics.json'), 'utf-8'))
  expect(saved.runs).toHaveLength(3)
  expect(saved.runs[0].modelName).toBe('Capture 0')
  await expect(page.getByRole('button', { name: 'Configure backend', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run diagnostics', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open jobs', exact: true })).toHaveCount(0)
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1000, 700); window.webContents.setZoomFactor(1.5) })
  await assertSafeArea()
  await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
  await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await recentRuns.scrollIntoViewIfNeeded()
  await captureRenderer(info, 'dashboard-statistics-small.png')
  expect(errors).toEqual([])
})

test('About uses a themed modal with keyboard focus, dismissal, and guarded credits navigation', async ({}, info) => {
  const trigger = page.locator('.app-title-bar-menu')
  await trigger.focus()
  await chooseMenu('Help', 'About NAM-BOT')
  const modal = page.getByRole('dialog', { name: 'About NAM-BOT' })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(modal.getByRole('button', { name: 'Project Website', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('themed-about.png') })
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await chooseMenu('File', 'New Job')
  await page.locator('#job-name').fill('Protected entry')
  await chooseMenu('Help', 'About NAM-BOT')
  await modal.getByRole('button', { name: 'Credits Screen', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing', exact: true }).click()
  await expect(page.locator('#job-name')).toHaveValue('Protected entry')
  expect(errors).toEqual([])
})

test('a second instance activates the existing window', async () => {
  const window = await app.browserWindow(page)
  await window.evaluate((win) => win.minimize())
  const executable = await app.evaluate(() => process.execPath)
  const args = process.env.NAM_BOT_TEST_EXECUTABLE ? [] : ['.']
  const environment: NodeJS.ProcessEnv = { ...process.env, NAM_BOT_DESKTOP_SHELL_SMOKE: '1', NAM_BOT_DESKTOP_SHELL_DATA: dataPath }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(executable, args, { env: environment, windowsHide: true, stdio: 'ignore' })
  const result = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Second instance did not exit')) }, 15_000)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => { clearTimeout(timer); resolve(code) })
  })
  expect(result).toBe(0)
  await expect.poll(() => window.evaluate((win) => win.isMinimized())).toBe(false)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('macOS recreates the window with functioning shell subscriptions', async () => {
  test.skip(process.platform !== 'darwin', 'macOS Dock lifecycle only')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
  const newWindow = app.waitForEvent('window')
  await app.evaluate(({ app }) => app.emit('activate'))
  page = await newWindow
  await expect(page.locator('.app-title-bar')).toBeVisible()
  await assertSafeArea()
})

test('shell requests reject foreign windows and report native focus changes', async () => {
  const main = await app.browserWindow(page)
  const newWindow = app.waitForEvent('window')
  await app.evaluate(({ BrowserWindow, app }) => {
    const foreign = new BrowserWindow({ width: 300, height: 200, webPreferences: {
      preload: `${app.getAppPath()}/out/preload/index.js`, sandbox: true, contextIsolation: true, nodeIntegration: false
    } })
    void foreign.loadURL('about:blank')
    foreign.focus()
  })
  const foreign = await newWindow
  await foreign.waitForLoadState()
  await expect(page.locator('.app-title-bar')).toHaveAttribute('data-focused', 'false')
  expect(await foreign.evaluate(async () => {
    try { await window.namBot.shell.getWindowState(); return 'accepted' } catch (error) { return String(error) }
  })).toContain('main application window')
  expect(await foreign.evaluate(async () => {
    try { await window.namBot.shell.setDialogsReady(true); return 'accepted' } catch (error) { return String(error) }
  })).toContain('main application window')
  expect(await foreign.evaluate(async () => {
    try { await window.namBot.shell.respondToDialog('unknown', 1); return 'accepted' } catch (error) { return String(error) }
  })).toContain('main application window')
  const foreignWindow = await app.browserWindow(foreign)
  await foreignWindow.evaluate((win) => win.close())
  await main.evaluate((win) => win.focus())
  await expect(page.locator('.app-title-bar')).toHaveAttribute('data-focused', 'true')
})

test('Windows native hit regions distinguish drag, menu and caption controls', async () => {
  test.skip(process.platform !== 'win32', 'Windows nonclient hit testing only')
  const points = await page.evaluate(() => {
    const menu = document.querySelector('.app-title-bar-menu')!.getBoundingClientRect()
    const safe = document.querySelector('.app-title-bar-safe-area')!.getBoundingClientRect()
    const controlsWidth = window.innerWidth - safe.right
    const y = safe.height / 2
    return [
      { name: 'drag', x: safe.width / 2, y },
      { name: 'menu', x: menu.left + menu.width / 2, y },
      { name: 'minimize', x: safe.right + controlsWidth / 6, y },
      { name: 'maximize', x: safe.right + controlsWidth / 2, y },
      { name: 'close', x: safe.right + controlsWidth * 5 / 6, y }
    ]
  })
  const native = await app.evaluate(({ BrowserWindow, screen }, points) => {
    const win = BrowserWindow.getAllWindows()[0]
    const bounds = win.getContentBounds()
    const zoom = win.webContents.getZoomFactor()
    return {
      handle: win.getNativeWindowHandle().readBigUInt64LE().toString(),
      points: points.map((point) => ({ name: point.name, ...screen.dipToScreenPoint({
        x: Math.round(bounds.x + point.x * zoom), y: Math.round(bounds.y + point.y * zoom)
      }) }))
    }
  }, points)
  const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    resolve('tests/desktop/windows-hit-test.ps1'), '-WindowHandle', native.handle, '-PointsJson', JSON.stringify(native.points)], { windowsHide: true })
  expect(JSON.parse(result.stdout)).toEqual([
    { name: 'drag', hit: 2 }, { name: 'menu', hit: 1 },
    { name: 'minimize', hit: 8 }, { name: 'maximize', hit: 9 }, { name: 'close', hit: 20 }
  ])
})
