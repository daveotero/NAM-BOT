import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCampaignReplay } from './epoch-runner-replay'

let app: ElectronApplication
let page: Page
let dataPath: string
let errors: string[]

test.beforeEach(async () => {
  dataPath = await realpath(await mkdtemp(join(tmpdir(), 'nam-bot-shell-epoch-')))
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
  }
  env.NAM_BOT_DESKTOP_SHELL_SMOKE = '1'
  env.NAM_BOT_DESKTOP_SHELL_DATA = dataPath
  app = await electron.launch({
    ...(process.env.NAM_BOT_TEST_EXECUTABLE ? { executablePath: resolve(process.env.NAM_BOT_TEST_EXECUTABLE) } : {}),
    args: [...(process.env.NAM_BOT_TEST_EXECUTABLE ? [] : ['.']), '--mute-audio'],
    env
  })
  page = await app.firstWindow()
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('a[href="#/about"]').click()
  await expect(page.getByRole('region', { name: 'About terminal' })).toBeFocused()
  await page.keyboard.type('epochrunner')
  await expect.poll(async () => page.locator('.terminal-prompt').last().evaluate((element) => {
    const viewport = element.closest('.terminal-scroll-area')
    const cursor = element.querySelector('.terminal-cursor')
    if (!viewport || !cursor) return false
    const cursorBounds = cursor.getBoundingClientRect()
    return viewport.getBoundingClientRect().bottom - cursorBounds.bottom >= cursorBounds.height
  })).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.locator('.epoch-runner-shell')).toHaveAttribute('data-status', 'ready')
})

async function capture(info: TestInfo, name: string): Promise<void> {
  // capturePage includes Electron's compositor and application zoom.
  const png = await app.evaluate(async ({ BrowserWindow }) => (
    await BrowserWindow.getAllWindows()[0].webContents.capturePage()
  ).toPNG().toString('base64'))
  await writeFile(info.outputPath(name), Buffer.from(png, 'base64'))
  await info.attach(name, { body: Buffer.from(png, 'base64'), contentType: 'image/png' })
}

async function freezeClock(): Promise<void> {
  await page.clock.install({ time: new Date('2026-09-19T00:00:00Z') })
  // install() alone still advances between calls. Pausing makes screenshots and
  // IPC latency irrelevant to the recorded keyboard timing.
  await page.clock.pauseAt(new Date('2026-09-19T00:00:01Z'))
  await page.clock.runFor(64)
}

test.afterEach(async ({}, info) => {
  if (page && !page.isClosed()) await capture(info, 'final.png')
  if (app) await app.close()
  try {
    await info.attach('application-log', { body: await readFile(join(dataPath, 'logs/nam-bot.log')), contentType: 'text/plain' })
  } catch { /* A launch failure may precede log creation. */ }
  expect(errors).toEqual([])
})

test('Epoch Runner input, viewport, focus, navigation, records and audio preferences', async ({}, info) => {
  const game = page.locator('.epoch-runner-shell')
  const nativeWindow = await app.browserWindow(page)
  for (const size of [{ width: 1000, height: 700 }, { width: 1400, height: 900 }]) {
    await nativeWindow.evaluate((win, value) => win.setSize(value.width, value.height), size)
    await expect.poll(async () => game.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight && element.scrollWidth <= element.clientWidth
    })).toBe(true)
    await capture(info, 'title-' + size.width + '.png')
  }
  await page.evaluate(() => {
    const originalResume = AudioContext.prototype.resume
    const originalSuspend = AudioContext.prototype.suspend
    AudioContext.prototype.resume = function (this: AudioContext): Promise<void> {
      document.documentElement.dataset.audioResumes = String(Number(document.documentElement.dataset.audioResumes ?? '0') + 1)
      return originalResume.call(this)
    }
    AudioContext.prototype.suspend = function (this: AudioContext): Promise<void> {
      document.documentElement.dataset.audioSuspends = String(Number(document.documentElement.dataset.audioSuspends ?? '0') + 1)
      return originalSuspend.call(this)
    }
  })
  await expect(page.getByRole('button', { name: '[M] SOUND OFF', exact: true })).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: '[M] SOUND ON', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(game).toHaveAttribute('data-status', 'running')
  await expect(page.locator('.epoch-runner-canvas')).toHaveCSS('cursor', 'none')
  await expect(page.getByRole('button', { name: '[M] SOUND ON', exact: true })).toHaveCSS('cursor', 'pointer')
  await page.keyboard.down('Space')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(game).toHaveAttribute('data-status', 'paused')
  await expect(page.locator('.epoch-runner-canvas')).not.toHaveCSS('cursor', 'none')
  await expect(page.locator('html')).toHaveAttribute('data-audio-resumes', /^[1-9]/)
  await expect(page.locator('html')).toHaveAttribute('data-audio-suspends', /^[1-9]/)
  const pausedAt = await game.getAttribute('data-runtime')
  await page.waitForTimeout(160)
  await expect(game).toHaveAttribute('data-runtime', pausedAt ?? '')
  await page.keyboard.up('Space')
  await page.keyboard.press('p')
  await expect(game).toHaveAttribute('data-status', 'running')
  await page.locator('a[href="#/jobs"]').click()
  await page.locator('a[href="#/about"]').click()
  await expect(game).toHaveAttribute('data-status', 'paused')
  await page.keyboard.press('p')
  await expect(game).toHaveAttribute('data-status', 'running')
  await page.keyboard.press('Escape')
  await expect(game).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'About terminal' })).toBeFocused()
  await expect(page.locator('.terminal-history-item').filter({ hasText: 'epochrunner' })).toBeVisible()
  await capture(info, 'terminal-prompt-padding.png')
  await page.keyboard.type('epochrunner')
  await page.keyboard.press('Enter')
  await expect(game).toHaveAttribute('data-status', 'ready')
  await expect(page.getByRole('button', { name: '[M] SOUND ON', exact: true })).toBeVisible()
  await page.keyboard.press('h')
  await expect(page.getByRole('heading', { name: 'TRAINING RECORDS' })).toBeVisible()
  await page.keyboard.press('h')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.epoch-cursor')).toHaveCSS('animation-name', 'none')
  await capture(info, 'reduced-motion.png')
})

test('Epoch Runner complete campaign via keyboard, upgrade, score archive and reward', async ({}, info) => {
  test.setTimeout(180_000)
  const game = page.locator('.epoch-runner-shell')
  const replay = createCampaignReplay(42)
  expect(replay[4].airDashCaptureMs).toBeGreaterThan(0)
  await freezeClock()
  await page.evaluate(() => {
    let seed = 42
    Math.random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
  })
  await page.keyboard.press('Space')
  for (const pass of replay) {
    let elapsed = 0
    let capturedPlay = false
    let capturedAirDash = false
    // First paint after a transition resets the frame accumulator.
    await page.clock.runFor(16)
    for (const key of pass.keys) {
      const at = Math.round(key.atMs)
      if (!capturedAirDash && pass.airDashCaptureMs !== undefined && at >= pass.airDashCaptureMs) {
        const captureAt = Math.round(pass.airDashCaptureMs)
        await page.clock.runFor(Math.max(0, captureAt - elapsed))
        await capture(info, 'air-dash-' + pass.stage + '.png')
        capturedAirDash = true
        elapsed = captureAt
      }
      await page.clock.runFor(Math.max(0, at - elapsed))
      if (key.held) await page.keyboard.down(key.key)
      else await page.keyboard.up(key.key)
      elapsed = at
      if (!capturedPlay && elapsed > 8000) {
        await capture(info, 'playing-' + pass.stage + '.png')
        capturedPlay = true
      }
    }
    await page.clock.runFor(Math.max(0, Math.ceil(pass.durationMs) - elapsed) + 200)
    await page.keyboard.up('Space')
    await page.keyboard.up('s')
    await expect(game, 'stage ' + pass.stage).toHaveAttribute('data-status', pass.status)
    await capture(info, 'stage-' + pass.stage + '.png')
    if (pass.stage === 2 || pass.stage === 5) {
      const nativeWindow = await app.browserWindow(page)
      await nativeWindow.evaluate((win) => win.setSize(1000, 700))
      await expect.poll(async () => page.locator('.epoch-primary').evaluate((button) => {
        const overlay = button.closest('.epoch-runner-overlay')
        if (!overlay) return false
        const action = button.getBoundingClientRect()
        const bounds = overlay.getBoundingClientRect()
        return action.top >= bounds.top && action.bottom <= bounds.bottom && action.left >= bounds.left && action.right <= bounds.right
      })).toBe(true)
      await capture(info, 'small-stage-' + pass.stage + '.png')
      await nativeWindow.evaluate((win) => win.setSize(1400, 900))
    }
    if (pass.stage < 5) {
      await page.clock.runFor(2700)
      await page.keyboard.press('Space')
    }
  }
  await expect(page.getByRole('heading', { name: 'MODEL CONVERGED' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Score initials' }).fill('NAM')
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('textbox', { name: 'Score initials' })).toHaveValue('NA')
  await page.getByRole('textbox', { name: 'Score initials' }).fill('NAM')
  await page.getByRole('button', { name: 'ADD REWARD PRESET', exact: true }).click()
  await expect(page.getByRole('button', { name: 'REWARD PRESET IN LIBRARY', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '[H] RECORDS', exact: true }).click()
  await expect(page.locator('.epoch-score-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.epoch-score-table tbody tr')).toContainText('NAM')
  // Let the frozen compositor paint the archive before the native capture.
  await page.clock.runFor(64)
  await capture(info, 'records.png')
  const presets = await page.evaluate(async () => await window.namBot.presets.list())
  const rewards = presets.filter((preset) => typeof preset === 'object' && preset !== null && 'id' in preset && preset.id === 'epoch-runner-reward')
  expect(rewards).toHaveLength(1)
  expect(rewards[0]).toMatchObject({
    name: 'Demonic Convergence',
    stopping: { mode: 'convergence', level: 'thorough', maxEpochs: 6666 },
    values: { architectureVersion: 'a2', modelFamily: 'PackedWaveNet' },
    expert: { model: { net: { config: {
      submodels: [3, 8, 12, 16, 20, 24, 28].map((channel) => ({ name: `channels_${channel}` }))
    } } } }
  })
  await page.keyboard.press('Escape')
  await expect(game).toHaveCount(0)
  await page.keyboard.type('epochrunner')
  await page.keyboard.press('Enter')
  // The terminal loader schedules its next timeout after each React commit.
  // Pump in steps so commits can happen between the chained timers.
  for (let attempt = 0; attempt < 80 && await game.count() === 0; attempt++) {
    await page.clock.runFor(250)
  }
  await expect(game).toHaveAttribute('data-status', 'ready')
  await page.keyboard.press('h')
  await expect(page.locator('.epoch-score-table tbody tr')).toHaveCount(1)
  await page.clock.runFor(64)
  await info.attach('campaign-timings', { body: JSON.stringify(replay.map((pass) => ({ stage: pass.stage, seconds: pass.durationMs / 1000 })), null, 2), contentType: 'application/json' })
})

test('Epoch Runner game over, fresh key guard and unavailable storage', async ({}, info) => {
  const game = page.locator('.epoch-runner-shell')
  await freezeClock()
  await page.evaluate(() => {
    Storage.prototype.setItem = (): never => { throw new Error('Test quota exceeded') }
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Test audio unavailable') } } })
  })
  await page.keyboard.press('m')
  // Storage has precedence in the visible status, but audio failure must also be nonfatal.
  await expect(page.locator('.epoch-status-line')).toContainText('Archive unavailable')
  await page.keyboard.press('Space')
  await page.clock.runFor(20000)
  await expect(game).toHaveAttribute('data-status', 'crashed')
  await page.keyboard.down('Space')
  await page.clock.runFor(20000)
  await expect(game).toHaveAttribute('data-status', 'crashed')
  // A held/repeated space cannot dismiss the newly reached report.
  await page.keyboard.down('Space')
  await expect(game).toHaveAttribute('data-status', 'crashed')
  await page.keyboard.up('Space')
  await page.clock.runFor(500)
  await page.keyboard.press('Space')
  await page.clock.runFor(20000)
  await expect(game).toHaveAttribute('data-status', 'game-over')
  await expect(page.locator('.epoch-status-line')).toContainText('Archive unavailable')
  await capture(info, 'game-over.png')
})
