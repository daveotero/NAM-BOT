import { describe, expect, it } from 'vitest'
import {
  AIR_DASH_DURATION_MS, EPOCH_RUNNER_STEP_MS, GROUND_Y, PLAYER_HEIGHT,
  advanceEpochRunner, buildEpochRunnerPattern, createInitialEpochRunnerState, getEpochRunnerStage,
  pauseEpochRunner, resumeEpochRunner, retryEpochRunnerStage, startEpochRunner, stepEpochRunner,
  type EpochRunnerInput, type EpochRunnerState
} from './about-game-engine'

const idle: EpochRunnerInput = { jumpPressed: false, jumpHeld: false, duckPressed: false, duckHeld: false }
const dash: EpochRunnerInput = { ...idle, duckPressed: true, duckHeld: true }

function running(): EpochRunnerState {
  return {
    ...startEpochRunner(createInitialEpochRunnerState()), currentStage: 5,
    duckDashUnlocked: true, stageTargetEpochs: 180, patternCooldownMs: Infinity
  }
}

function jump(state: EpochRunnerState): EpochRunnerState {
  let next = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, { ...idle, jumpPressed: true, jumpHeld: true })
  for (let frame = 1; frame < 15; frame++) next = stepEpochRunner(next, EPOCH_RUNNER_STEP_MS, { ...idle, jumpHeld: true })
  return next
}

function crossPlateau(maximum: boolean, jumpLead: number, dashDelay: number | null): EpochRunnerState {
  const pattern = buildEpochRunnerPattern('jump-dash', 1, () => 0.5, 5)
  let state: EpochRunnerState = { ...running(), ...pattern }
  let jumpAt: number | null = null
  for (let frame = 0; frame < 800 && state.status === 'running' && (state.obstacles.length || !state.player.isGrounded); frame++) {
    state = { ...state, stageDistance: maximum ? 100000 : 0, speed: maximum ? 418 : 300 }
    const gap = state.obstacles.length ? state.obstacles[0].x - (state.player.x + state.player.width - 6) : Infinity
    const jumpPressed = jumpAt === null && gap <= state.speed * jumpLead
    if (jumpPressed) jumpAt = state.timeMs
    const duckPressed = dashDelay !== null && jumpAt !== null && !state.player.isGrounded
      && !state.player.airDashUsed && state.timeMs - jumpAt >= dashDelay
    state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, {
      jumpPressed, jumpHeld: jumpAt !== null, duckPressed, duckHeld: duckPressed || state.player.airDashMs > 0
    })
  }
  return state
}

describe('Epoch Runner air dash', () => {
  it('still takes off when jump and dash are pressed together on the ground', () => {
    const state = stepEpochRunner(running(), EPOCH_RUNNER_STEP_MS, { ...dash, jumpPressed: true, jumpHeld: true })
    expect(state.player.isGrounded).toBe(false)
    expect(state.player.velocityY).toBeLessThan(0)
    expect(state.player.airDashMs).toBe(0)
  })

  it('unlocks with the optimizer and adds forward travel while holding height', () => {
    const airborne = jump(running())
    const locked = stepEpochRunner({ ...airborne, duckDashUnlocked: false }, EPOCH_RUNNER_STEP_MS, dash)
    expect(locked.player.airDashMs).toBe(0)
    expect(locked.events).toEqual([])
    const active = stepEpochRunner(airborne, EPOCH_RUNNER_STEP_MS, dash)
    expect(active.player.y).toBe(airborne.player.y)
    expect(active.player.velocityY).toBe(0)
    expect(active.player.isDucking).toBe(false)
    expect(active.distance - locked.distance).toBeGreaterThan(0.9)
    expect(active.events.map((event) => event.kind)).toEqual(['dash'])
  })

  it('expires after one burst, rejects repeated air presses, and recharges on landing', () => {
    let state = stepEpochRunner(jump(running()), EPOCH_RUNNER_STEP_MS, dash)
    const height = state.player.y
    for (let frame = 1; frame < Math.floor(AIR_DASH_DURATION_MS / EPOCH_RUNNER_STEP_MS); frame++) {
      state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, dash)
      expect(state.player.y).toBe(height)
      expect(state.events).toEqual([])
    }
    for (let frame = 0; frame < 3; frame++) state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, dash)
    expect(state.player.airDashMs).toBe(0)
    expect(state.player.airDashUsed).toBe(true)
    expect(state.player.y).toBeGreaterThan(height)
    for (let frame = 0; frame < 60 && !state.player.isGrounded; frame++) state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, idle)
    expect(state.player.isGrounded).toBe(true)
    expect(state.player.airDashUsed).toBe(false)
    const second = stepEpochRunner(jump(state), EPOCH_RUNNER_STEP_MS, dash)
    expect(second.player.airDashMs).toBeGreaterThan(0)
  })

  it('cancels on release without granting a second dash in the same jump', () => {
    const active = stepEpochRunner(jump(running()), EPOCH_RUNNER_STEP_MS, dash)
    const released = stepEpochRunner(active, EPOCH_RUNNER_STEP_MS, idle)
    expect(released.player.airDashMs).toBe(0)
    expect(released.player.y).toBeGreaterThan(active.player.y)
    const retried = stepEpochRunner(released, EPOCH_RUNNER_STEP_MS, dash)
    expect(retried.player.airDashMs).toBe(0)
    expect(retried.events).toEqual([])
  })

  it('keeps collisions active during the air dash', () => {
    const airborne = jump(running())
    const blocked = stepEpochRunner({
      ...airborne,
      obstacles: [{ id: 1, type: 'signal-tunnel', x: airborne.player.x, y: 98, width: 86, height: 118 }]
    }, EPOCH_RUNNER_STEP_MS, dash)
    expect(blocked.status).toBe('crashed')
    expect(blocked.player.airDashUsed).toBe(true)
  })

  it('freezes a paused dash and resets it on retry and stage advance', () => {
    const active = stepEpochRunner(jump(running()), EPOCH_RUNNER_STEP_MS, dash)
    const paused = pauseEpochRunner(active)
    expect(stepEpochRunner(paused, 1000, dash)).toBe(paused)
    expect(stepEpochRunner(resumeEpochRunner(paused), EPOCH_RUNNER_STEP_MS, idle).player.airDashMs).toBe(0)
    for (const reset of [
      retryEpochRunnerStage({ ...active, status: 'crashed' }),
      advanceEpochRunner({ ...active, currentStage: 4, status: 'stage-complete' })
    ]) {
      expect(reset.player).toMatchObject({ airDashMs: 0, airDashUsed: false, isGrounded: true })
    }
  })

  it('keeps the new obstacle in stage 5 and introduces it first, including on retry', () => {
    for (let stage = 1; stage <= 4; stage++) expect(getEpochRunnerStage(stage).patterns).not.toContain('jump-dash')
    expect(getEpochRunnerStage(5).patterns).toContain('jump-dash')
    for (const state of [running(), retryEpochRunnerStage({ ...running(), status: 'crashed' })]) {
      const first = stepEpochRunner({ ...state, patternCooldownMs: 0 }, EPOCH_RUNNER_STEP_MS, idle, { rng: () => 0.99 })
      expect(first.obstacles.map((obstacle) => obstacle.type)).toEqual(['loss-plateau'])
    }
  })

  for (const maximum of [false, true]) {
    it('allows a range of jump and dash timings at ' + (maximum ? 'maximum' : 'entry') + ' speed', () => {
      for (const jumpLead of [0.15, 0.2, 0.25, 0.3]) {
        for (const dashDelay of [150, 200, 250, 300, 350, 400]) {
          const result = crossPlateau(maximum, jumpLead, dashDelay)
          expect(result.status, JSON.stringify({ jumpLead, dashDelay })).toBe('running')
          expect(result.obstacles).toHaveLength(0)
          expect(result.player.isGrounded).toBe(true)
        }
      }
    })

    it('requires the air dash even with a full-height jump at ' + (maximum ? 'maximum' : 'entry') + ' speed', () => {
      for (let jumpLead = 0.05; jumpLead <= 0.6; jumpLead += 0.025) {
        expect(crossPlateau(maximum, jumpLead, null).status, 'jump lead ' + jumpLead).toBe('crashed')
      }
      const state = running()
      const floor = buildEpochRunnerPattern('jump-dash', 1, () => 0.5, 5).obstacles[0]
      const groundSlide = stepEpochRunner({ ...state, obstacles: [{ ...floor, x: state.player.x }] }, EPOCH_RUNNER_STEP_MS, dash)
      expect(groundSlide.status).toBe('crashed')
      expect(groundSlide.player.y).toBe(GROUND_Y - PLAYER_HEIGHT)
    })
  }
})
