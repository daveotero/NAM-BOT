import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

let app: ElectronApplication
let page: Page
let dataPath: string
let errors: string[]

test.beforeEach(async () => {
  dataPath = await realpath(await mkdtemp(join(tmpdir(), 'nam-bot-shell-')))
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
    const activity = document.querySelector('.app-title-bar-activity')!.getBoundingClientRect()
    const rect = bar.getBoundingClientRect()
    const main = document.querySelector('main')!.getBoundingClientRect()
    const scale = Number(getComputedStyle(bar).getPropertyValue('--shell-scale'))
    const fullscreen = bar.getAttribute('data-fullscreen') === 'true'
    const platform = bar.getAttribute('data-platform')
    return {
      fits: activity.right <= safe.right + 1 && wordmark.left >= safe.left && activity.left > wordmark.right,
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
  await app.evaluate(({ dialog }) => {
    process.env.NAM_BOT_DESKTOP_SHELL_ACTIVE = '1'
    Reflect.set(globalThis, 'shellTestConfirmations', 0)
    dialog.showMessageBox = async () => {
      Reflect.set(globalThis, 'shellTestConfirmations', Number(Reflect.get(globalThis, 'shellTestConfirmations')) + 1)
      return { response: 0, checkboxChecked: false }
    }
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'shellTestConfirmations'))).toBe(1)
  await app.evaluate(({ app }) => app.quit())
  await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'shellTestConfirmations'))).toBe(2)
  await chooseMenu(process.platform === 'darwin' ? await app.evaluate(({ app }) => app.name) : 'File', 'quit')
  await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'shellTestConfirmations'))).toBe(3)
  await expect(page.locator('.app-title-bar')).toBeVisible()
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
