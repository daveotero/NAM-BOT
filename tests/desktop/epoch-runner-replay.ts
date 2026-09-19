import {
  EPOCH_RUNNER_STEP_MS, PLAYER_X, advanceEpochRunner, createInitialEpochRunnerState,
  startEpochRunner, stepEpochRunner, type EpochRunnerInput
} from '../../src/renderer/features/about/about-game-engine'

export interface ReplayKey {
  atMs: number
  key: 'Space' | 's'
  held: boolean
}

export interface ReplayStage {
  stage: number
  durationMs: number
  keys: ReplayKey[]
  status: string
  score: number
  airDashCaptureMs?: number
}

/** Produce physical key transitions from a seeded simulation, without modifying the app. */
export function createCampaignReplay(seed: number): ReplayStage[] {
  let currentSeed = seed
  const random = (): number => {
    currentSeed = (Math.imul(currentSeed, 1664525) + 1013904223) >>> 0
    return currentSeed / 4294967296
  }
  let state = startEpochRunner(createInitialEpochRunnerState())
  const result: ReplayStage[] = []
  for (let stage = 1; stage <= 5; stage++) {
    const keys: ReplayKey[] = []
    let previousJump = false
    let previousDuck = false
    let jumpAt = -1000
    let holdMs = 200
    let airDashCaptureMs: number | undefined
    for (let frame = 0; frame < 60 * 120 && state.status === 'running'; frame++) {
      const obstacle = state.obstacles.find((item) => item.x + item.width > PLAYER_X + 8)
      const beam = obstacle?.type === 'signal-beam' || obstacle?.type === 'signal-tunnel'
      const gap = obstacle ? obstacle.x - (state.player.x + state.player.width - 6) : Infinity
      const jumpPressed = !!obstacle && !beam && state.player.isGrounded && !state.player.isDucking && gap <= state.speed * 0.25
      if (jumpPressed) {
        jumpAt = state.timeMs
        holdMs = obstacle?.type === 'cab-wall' || obstacle?.type === 'loss-plateau' ? 300 : 200
      }
      const duckPressed = (!!obstacle && beam && state.player.isGrounded && state.player.duckDashMs <= 0 && gap <= state.speed * 0.1)
        || (obstacle?.type === 'loss-plateau' && !state.player.isGrounded && !state.player.airDashUsed && state.timeMs - jumpAt >= 250)
      const input: EpochRunnerInput = {
        jumpPressed, jumpHeld: jumpPressed || (!state.player.isGrounded && state.timeMs - jumpAt < holdMs),
        duckPressed, duckHeld: duckPressed || state.player.duckDashMs > 0 || state.player.airDashMs > 0
      }
      if (input.jumpHeld !== previousJump) keys.push({ atMs: state.stageTimeMs, key: 'Space', held: input.jumpHeld })
      if (input.duckHeld !== previousDuck) keys.push({ atMs: state.stageTimeMs, key: 's', held: input.duckHeld })
      previousJump = input.jumpHeld
      previousDuck = input.duckHeld
      state = stepEpochRunner(state, EPOCH_RUNNER_STEP_MS, input, { rng: random })
      if (state.player.airDashMs > 0 && airDashCaptureMs === undefined) airDashCaptureMs = state.stageTimeMs + 120
    }
    if (!['stage-complete', 'cutscene', 'won'].includes(state.status)) throw new Error('Replay did not clear stage ' + stage + ': ' + state.resultHeadline)
    result.push({ stage, durationMs: state.stageTimeMs, keys, status: state.status, score: state.score, airDashCaptureMs })
    if (state.status !== 'won') state = advanceEpochRunner(state)
  }
  return result
}
