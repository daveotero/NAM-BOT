import { describe, expect, it } from 'vitest'
import {
  EPOCH_RUNNER_STEP_MS, PLAYER_X, advanceEpochRunner, buildEpochRunnerPattern,
  createInitialEpochRunnerState, getEpochRunnerStage, pauseEpochRunner, resumeEpochRunner,
  retryEpochRunnerStage, startEpochRunner, stepEpochRunner,
  type EpochRunnerCollectible, type EpochRunnerInput, type EpochRunnerPatternKind, type EpochRunnerState
} from './about-game-engine'

const idle: EpochRunnerInput = { jumpPressed: false, jumpHeld: false, duckPressed: false, duckHeld: false }

function packet(state: EpochRunnerState, overrides: Partial<EpochRunnerCollectible> = {}): EpochRunnerCollectible {
  return { id: 999, x: state.player.x + 8, y: state.player.y + 12, width: 26, height: 26, type: 'epoch-bundle', value: 5, bobPhase: 0, isBonus: false, ...overrides }
}

function rng(seed: number): () => number {
  let current = seed
  return (): number => {
    current = (Math.imul(current, 1664525) + 1013904223) >>> 0
    return current / 4294967296
  }
}

interface Driver {
  jumpAt: number
  caches: boolean
  holdMs?: number
}

/** Feed real button transitions to the physics; never bypass collisions or award packets. */
function drive(state: EpochRunnerState, driver: Driver): EpochRunnerInput {
  const obstacle = state.obstacles.find((item) => item.x + item.width > PLAYER_X + 8)
  const beam = obstacle?.type === 'signal-beam' || obstacle?.type === 'signal-tunnel'
  const gap = obstacle ? obstacle.x - (state.player.x + state.player.width - 6) : Infinity
  const jumpPressed = !!obstacle && !beam && state.player.isGrounded && !state.player.isDucking && gap <= state.speed * 0.25
  if (jumpPressed) {
    driver.jumpAt = state.timeMs
    driver.holdMs = driver.caches ? 700 : obstacle?.type === 'cab-wall' || obstacle?.type === 'loss-plateau' ? 300 : 200
  }
  const duckPressed = (!!obstacle && beam && state.player.isGrounded && state.player.duckDashMs <= 0 && gap <= state.speed * 0.1)
    || (obstacle?.type === 'loss-plateau' && !state.player.isGrounded && !state.player.airDashUsed && state.timeMs - driver.jumpAt >= 250)
  return {
    jumpPressed,
    jumpHeld: jumpPressed || (!state.player.isGrounded && state.timeMs - driver.jumpAt < (driver.holdMs ?? 200)),
    duckPressed,
    duckHeld: duckPressed || state.player.duckDashMs > 0 || state.player.airDashMs > 0
  }
}

describe('Epoch Runner training progression', () => {
  it('requires jumping after the opening instead of farming obstacle-free calibration patterns', () => {
    let state = startEpochRunner(createInitialEpochRunnerState())
    // This random choice previously repeated clear lanes until stage completion.
    for (let frame = 0; frame < 600 && state.status === 'running'; frame++) {
      state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, idle, { rng: () => 0.99 })
    }
    expect(state.status).toBe('crashed')
    expect(state.stageEpochs).toBeLessThan(5)
  })

  it('scores a chain once per primary, applies the new multiplier to the next pickup, and caps at x4', () => {
    let state = startEpochRunner(createInitialEpochRunnerState())
    for (let i = 0; i < 20; i++) {
      state = stepEpochRunner({ ...state, collectibles: [packet(state, { value: 1 })] }, 0)
    }
    expect(state.chain).toBe(20)
    expect(state.maxChain).toBe(20)
    expect(state.score).toBe(5 * 100 + 5 * 200 + 5 * 300 + 5 * 400)
  })

  it('does not break or advance the chain for optional caches and breaks a missed primary exactly once', () => {
    const base = { ...startEpochRunner(createInitialEpochRunnerState()), chain: 5 }
    const bonus = stepEpochRunner({ ...base, collectibles: [packet(base, { isBonus: true, value: 10 })] }, 0)
    expect(bonus).toMatchObject({ chain: 5, score: 2000, epochsCollected: 10 })
    const missBonus = stepEpochRunner({ ...base, collectibles: [packet(base, { isBonus: true, x: 0 })] }, 0)
    expect(missBonus.chain).toBe(5)
    const miss = stepEpochRunner({ ...base, collectibles: [packet(base, { x: 0 })] }, 0)
    expect(miss.chain).toBe(0)
    expect(miss.events.map((event) => event.kind)).toEqual(['chain-broken'])
    expect(stepEpochRunner(miss, EPOCH_RUNNER_STEP_MS).events).toEqual([])
  })

  it('credits only the remaining epochs and applies clean-stage and final bonuses once', () => {
    const base = { ...startEpochRunner(createInitialEpochRunnerState()), currentStage: 5, stageEpochs: 179, stageTargetEpochs: 180, epochsCollected: 665, score: 7000 }
    const won = stepEpochRunner({ ...base, collectibles: [packet(base, { value: 10, isBonus: true })] }, 0)
    expect(won).toMatchObject({ status: 'won', epochsCollected: 666, stageEpochs: 180, score: 9500 })
    expect(stepEpochRunner(won, 1000)).toBe(won)
  })

  it('rolls back retry points, resets the chain, and withholds the clean-pass bonus after a crash', () => {
    const base = { ...startEpochRunner(createInitialEpochRunnerState()), score: 5000, stageStartScore: 1000, epochsCollected: 60, chain: 9 }
    const crashed = stepEpochRunner({ ...base, obstacles: [{ id: 8, x: PLAYER_X, y: 196, width: 34, height: 42, type: 'amp-stack' }] }, 0)
    expect(crashed).toMatchObject({ status: 'crashed', chain: 0, stageDeaths: 1, failureObstacleId: 8 })
    expect(crashed.resultDetail).toContain('Jump over the gradient block')
    const retry = retryEpochRunnerStage(crashed)
    expect(retry).toMatchObject({ score: 1000, stageEpochs: 0, stageDeaths: 1, chain: 0 })
    const complete = stepEpochRunner({ ...retry, stageEpochs: 65, collectibles: [packet(retry, { value: 1 })] }, 0)
    expect(complete.score).toBe(1600)
  })

  it('freezes all simulation state while paused, resumes without a buffered jump, and awards no distance points', () => {
    const base = stepEpochRunner(startEpochRunner(createInitialEpochRunnerState()), 16, { ...idle, jumpPressed: true, jumpHeld: true })
    const paused = pauseEpochRunner(base)
    expect(stepEpochRunner(paused, 10000, { ...idle, duckPressed: true })).toBe(paused)
    const resumed = resumeEpochRunner(paused)
    expect(resumed).toMatchObject({ status: 'running', timeMs: base.timeMs, distance: base.distance, score: 0 })
    expect(resumed.player.y).toBe(base.player.y)
    expect(resumed.player.jumpBufferMs).toBe(0)
  })

  for (let stage = 1; stage <= 5; stage++) {
    const patterns: EpochRunnerPatternKind[] = [...getEpochRunnerStage(stage).patterns]
    if (stage === 3) patterns.push('duck-beam-tutorial')
    for (const speed of ['entry', 'maximum']) {
      for (const caches of [false, true]) {
        it('traverses every stage ' + stage + ' pattern and transition at ' + speed + ' speed / ' + (caches ? 'held' : 'short') + ' jumps', () => {
          for (const first of patterns) {
            for (const second of patterns) {
              const a = buildEpochRunnerPattern(first, 1, rng(42), stage)
              const b = buildEpochRunnerPattern(second, a.nextSpawnId, rng(43), stage)
              const right = Math.max(...[...a.obstacles, ...a.collectibles].map((item) => item.x + item.width))
              const offset = right - 800 + getEpochRunnerStage(stage).minPatternGapPx
              let state: EpochRunnerState = {
                ...startEpochRunner(createInitialEpochRunnerState()), currentStage: stage, stageTargetEpochs: 666,
                duckDashUnlocked: stage >= 3, patternCooldownMs: Infinity,
                obstacles: [...a.obstacles, ...b.obstacles.map((item) => ({ ...item, x: item.x + offset }))],
                collectibles: [...a.collectibles, ...b.collectibles.map((item) => ({ ...item, x: item.x + offset }))]
              }
              const driver: Driver = { jumpAt: -1000, caches }
              let recoveredCaches = 0
              for (let frame = 0; frame < 1400 && state.status === 'running' && (state.obstacles.length || state.collectibles.length); frame++) {
                state = { ...state, stageDistance: speed === 'entry' ? 0 : 100000 }
                state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, drive(state, driver))
                recoveredCaches += state.events.filter((event) => event.kind === 'pickup' && event.label.startsWith('FEATURE CACHE')).length
              }
              expect(state.status, JSON.stringify({ stage, speed, caches, first, second, failure: state.resultHeadline, x: state.obstacles.find((item) => item.id === state.failureObstacleId)?.x })).toBe('running')
              expect(state.obstacles).toHaveLength(0)
              expect(state.epochsCollected).toBeGreaterThan(0)
              if (caches) {
                expect(recoveredCaches, JSON.stringify({ stage, speed, first, second })).toBe(
                  [...a.collectibles, ...b.collectibles].filter((item) => item.isBonus).length
                )
              }
            }
          }
        })
      }
    }
  }

  for (const seed of [7, 42, 181]) {
    it('completes a seeded campaign in 3–5 minutes without collecting optional caches: ' + seed, () => {
      let state = startEpochRunner(createInitialEpochRunnerState())
      const random = rng(seed)
      const driver: Driver = { jumpAt: -1000, caches: false }
      const splits: number[] = []
      let cachePickups = 0
      for (let frame = 0; frame < 60 * 400 && state.status !== 'won'; frame++) {
        if (state.status === 'stage-complete' || state.status === 'cutscene') {
          splits.push(state.stageTimeMs / 1000)
          state = advanceEpochRunner(state)
        }
        state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, drive(state, driver), { rng: random })
        cachePickups += state.events.filter((event) => event.kind === 'pickup' && event.label.startsWith('FEATURE CACHE')).length
        expect(['crashed', 'game-over'], JSON.stringify({ stage: state.currentStage, time: state.timeMs, reason: state.resultHeadline })).not.toContain(state.status)
      }
      splits.push(state.stageTimeMs / 1000)
      expect(state.status, JSON.stringify(splits)).toBe('won')
      expect(state.epochsCollected).toBe(666)
      expect(cachePickups).toBe(0)
      expect(state.timeMs / 1000, JSON.stringify(splits)).toBeGreaterThanOrEqual(180)
      expect(state.timeMs / 1000, JSON.stringify(splits)).toBeLessThanOrEqual(300)
    })
  }
})
