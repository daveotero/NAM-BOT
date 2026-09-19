export const EPOCH_RUNNER_STAGE_COUNT = 5
export const EPOCH_RUNNER_STARTING_LIVES = 3
export const EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY = 'nam-bot:epoch-runner-best-score'

export const GAME_WIDTH = 800
export const GAME_HEIGHT = 280
export const GROUND_HEIGHT = 42
export const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT
export const PLAYER_X = 112
export const PLAYER_WIDTH = 34
export const PLAYER_HEIGHT = 42

const PLAYER_DUCK_HEIGHT = 24
const GRAVITY = 1750
const FALL_GRAVITY_MULTIPLIER = 1.12
const JUMP_RELEASE_GRAVITY_MULTIPLIER = 2.35
const JUMP_VELOCITY = -610
const JUMP_BUFFER_MS = 120
const COYOTE_TIME_MS = 92
export const DUCK_DASH_DURATION_MS = 540
export const AIR_DASH_DURATION_MS = 360
const AIR_DASH_SPEED = 500
export const EPOCH_RUNNER_STEP_MS = 1000 / 60
const DUCK_DASH_COOLDOWN_MS = 0
const MAX_DELTA_MS = 40
const PATTERN_RETRY_MS = 90

const STAGE_TARGET_EPOCHS = [66, 120, 140, 160, 180]

export const EPOCH_RUNNER_TARGET_EPOCHS = STAGE_TARGET_EPOCHS.reduce(
  (total, stageTarget) => total + stageTarget,
  0
)

export type EpochRunnerOutcome = 'none' | 'crashed' | 'won'
export type EpochRunnerStateStatus = 'ready' | 'running' | 'paused' | 'stage-complete' | 'cutscene' | 'crashed' | 'game-over' | 'won'
export type EpochRunnerObstacleType = 'amp-stack' | 'noise-burst' | 'cab-wall' | 'signal-beam' | 'signal-tunnel' | 'loss-plateau'
export type EpochRunnerCollectibleType = 'epoch' | 'epoch-bundle' | 'feature-cache'

export type EpochRunnerPatternKind =
  | 'single-hop'
  | 'low-burst'
  | 'staggered-hop'
  | 'rising-hop'
  | 'cab-hop'
  | 'epoch-line'
  | 'epoch-bundle'
  | 'duck-beam-tutorial'
  | 'duck-beam'
  | 'dash-tunnel'
  | 'dash-cache'
  | 'jump-dash'
  | 'mixed-gate'
  | 'final-sprint'

type CollectibleLane = 'ground' | 'hop' | 'high' | 'air-dash'
type EpochRunnerRandom = () => number

export interface EpochRunnerStageDefinition {
  name: string
  instruction: string
  patterns: EpochRunnerPatternKind[]
  baseSpeed: number
  maxSpeedBonus: number
  speedRamp: number
  minPatternGapPx: number
  cooldownMinMs: number
  cooldownMaxMs: number
}

export interface EpochRunnerPattern {
  obstacles: EpochRunnerObstacle[]
  collectibles: EpochRunnerCollectible[]
  nextSpawnId: number
}

export interface EpochRunnerInput {
  jumpPressed: boolean
  jumpHeld: boolean
  duckPressed: boolean
  duckHeld: boolean
}

export interface EpochRunnerStepOptions {
  rng?: EpochRunnerRandom
}

export interface EpochRunnerPlayer {
  x: number
  y: number
  width: number
  height: number
  velocityY: number
  isGrounded: boolean
  isDucking: boolean
  jumpBufferMs: number
  coyoteTimeMs: number
  duckDashMs: number
  duckCooldownMs: number
  airDashMs: number
  airDashUsed: boolean
}

export interface EpochRunnerObstacle {
  id: number
  x: number
  y: number
  width: number
  height: number
  type: EpochRunnerObstacleType
}

export interface EpochRunnerCollectible {
  id: number
  x: number
  y: number
  width: number
  height: number
  type: EpochRunnerCollectibleType
  value: number
  bobPhase: number
  isBonus: boolean
}

export type EpochRunnerEventKind = 'pickup' | 'chain' | 'chain-broken' | 'dash' | 'crash' | 'stage-complete' | 'upgrade' | 'won'

export interface EpochRunnerEvent {
  kind: EpochRunnerEventKind
  x: number
  y: number
  value: number
  label: string
}

export interface EpochRunnerRunStats {
  epochsCollected: number
  stageEpochs: number
  stageTargetEpochs: number
  stageTimeMs: number
  livesRemaining: number
  score: number
  distance: number
  timeMs: number
}

export interface EpochRunnerState extends EpochRunnerRunStats {
  status: EpochRunnerStateStatus
  outcome: EpochRunnerOutcome
  player: EpochRunnerPlayer
  obstacles: EpochRunnerObstacle[]
  collectibles: EpochRunnerCollectible[]
  speed: number
  currentStage: number
  stageDistance: number
  stageStartEpochs: number
  stageStartScore: number
  duckDashUnlocked: boolean
  patternCooldownMs: number
  patternsSpawnedInStage: number
  nextSpawnId: number
  resultHeadline: string
  resultDetail: string
  chain: number
  maxChain: number
  stageDeaths: number
  failureObstacleId: number | null
  events: EpochRunnerEvent[]
}

const idleInput: EpochRunnerInput = {
  jumpPressed: false,
  jumpHeld: false,
  duckPressed: false,
  duckHeld: false
}

function createInitialPlayer(): EpochRunnerPlayer {
  return {
    x: PLAYER_X,
    y: GROUND_Y - PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    velocityY: 0,
    isGrounded: true,
    isDucking: false,
    jumpBufferMs: 0,
    coyoteTimeMs: COYOTE_TIME_MS,
    duckDashMs: 0,
    duckCooldownMs: 0,
    airDashMs: 0,
    airDashUsed: false
  }
}

function getStageTargetEpochs(stage: number): number {
  const target = STAGE_TARGET_EPOCHS[Math.max(0, Math.min(stage - 1, STAGE_TARGET_EPOCHS.length - 1))]
  return target ?? STAGE_TARGET_EPOCHS[STAGE_TARGET_EPOCHS.length - 1]
}

export function getEpochRunnerStage(stage: number): EpochRunnerStageDefinition {
  if (stage === 1) {
    return {
      name: 'INPUT CALIBRATION',
      instruction: 'SPACE to jump. Hold for height; release for a short hop.',
      patterns: ['single-hop', 'low-burst', 'staggered-hop'],
      baseSpeed: 248,
      maxSpeedBonus: 72,
      speedRamp: 2.2,
      minPatternGapPx: 314,
      cooldownMinMs: 1100,
      cooldownMaxMs: 1450
    }
  }

  if (stage === 2) {
    return {
      name: 'FEATURE LEARNING',
      instruction: 'Tall activation blocks need a held jump. Double-outline caches are optional.',
      patterns: ['staggered-hop', 'rising-hop', 'cab-hop', 'epoch-bundle'],
      baseSpeed: 264,
      maxSpeedBonus: 80,
      speedRamp: 2.45,
      minPatternGapPx: 290,
      cooldownMinMs: 980,
      cooldownMaxMs: 1320
    }
  }

  if (stage === 3) {
    return {
      name: 'GRADIENT DESCENT',
      instruction: 'Hold S / DOWN to phase-slide under beams. Release to end the slide.',
      patterns: ['duck-beam', 'single-hop', 'low-burst', 'epoch-bundle'],
      baseSpeed: 264,
      maxSpeedBonus: 90,
      speedRamp: 2.55,
      minPatternGapPx: 332,
      cooldownMinMs: 990,
      cooldownMaxMs: 1340
    }
  }

  if (stage === 4) {
    return {
      name: 'VALIDATION',
      instruction: 'Slide through tall gates, then release and jump the next spike.',
      patterns: ['dash-tunnel', 'dash-cache', 'mixed-gate', 'duck-beam', 'staggered-hop', 'epoch-bundle'],
      baseSpeed: 282,
      maxSpeedBonus: 104,
      speedRamp: 2.7,
      minPatternGapPx: 318,
      cooldownMinMs: 900,
      cooldownMaxMs: 1240
    }
  }

  return {
    name: 'CONVERGENCE',
    instruction: 'Wide floor hazards: hold SPACE, then S / DOWN in the air.',
    patterns: ['jump-dash', 'final-sprint', 'dash-tunnel', 'dash-cache', 'mixed-gate', 'duck-beam', 'staggered-hop', 'epoch-bundle'],
    baseSpeed: 300,
    maxSpeedBonus: 118,
    speedRamp: 2.85,
    minPatternGapPx: 306,
    cooldownMinMs: 800,
    cooldownMaxMs: 1120
  }
}

function rectsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  )
}

function randomBetween(min: number, max: number, rng: EpochRunnerRandom): number {
  return min + (rng() * (max - min))
}

function pickOne<T>(items: T[], rng: EpochRunnerRandom): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length))
  return items[index]
}

function buildObstacle(
  id: number,
  type: EpochRunnerObstacleType,
  x: number
): EpochRunnerObstacle {
  if (type === 'loss-plateau') {
    return { id, type, x, y: GROUND_Y - 30, width: 300, height: 30 }
  }

  if (type === 'amp-stack') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 38,
      width: 34,
      height: 38
    }
  }

  if (type === 'noise-burst') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 26,
      width: 30,
      height: 26
    }
  }

  if (type === 'cab-wall') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 52,
      width: 44,
      height: 52
    }
  }

  if (type === 'signal-tunnel') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 140,
      width: 86,
      height: 118
    }
  }

  return {
    id,
    type,
    x,
    y: GROUND_Y - 48,
    width: 74,
    height: 22
  }
}

function buildCollectible(
  id: number, x: number, lane: CollectibleLane, value: number,
  rng: EpochRunnerRandom, isBonus: boolean = false
): EpochRunnerCollectible {
  const size = value >= 5 ? 26 : 20
  const top = lane === 'ground' ? GROUND_Y - 32 : lane === 'hop' ? GROUND_Y - 98
    : lane === 'air-dash' ? GROUND_Y - 130 : GROUND_Y - 160
  return {
    id, x, y: top, width: size, height: size, value, isBonus,
    type: isBonus ? 'feature-cache' : value >= 5 ? 'epoch-bundle' : 'epoch',
    bobPhase: rng() * Math.PI * 2
  }
}

/** Space actions for the stage's fastest speed, not its entry speed. */
export function buildEpochRunnerPattern(
  pattern: EpochRunnerPatternKind, nextSpawnId: number, rng: EpochRunnerRandom, stage: number = 1
): EpochRunnerPattern {
  const obstacles: EpochRunnerObstacle[] = []
  const collectibles: EpochRunnerCollectible[] = []
  const startX = GAME_WIDTH + 24
  const config = getEpochRunnerStage(stage)
  const stride = Math.max(260, (config.baseSpeed + config.maxSpeedBonus) * 0.95)
  let nextId = nextSpawnId
  const packet = (offset: number, lane: CollectibleLane, value: number, bonus: boolean = false): void => {
    collectibles.push(buildCollectible(nextId++, startX + offset, lane, value, rng, bonus))
  }
  const hazard = (offset: number, type: EpochRunnerObstacleType): void => {
    obstacles.push(buildObstacle(nextId++, type, startX + offset))
  }
  const primaryValue = 1
  const first = 180

  if (pattern === 'epoch-line') {
    packet(50, 'ground', primaryValue)
    packet(170, 'ground', primaryValue)
    packet(300, 'ground', primaryValue)
    if (stage >= 2) packet(180, 'high', 10, true)
  } else if (pattern === 'jump-dash') {
    packet(45, 'ground', primaryValue)
    hazard(first, 'loss-plateau')
    packet(first + 20, 'air-dash', 1)
    packet(first + 145, 'air-dash', 5)
    packet(first + 265, 'air-dash', 1)
    packet(first + 460, 'ground', primaryValue)
  } else {
    packet(45, 'ground', primaryValue)
    const types: EpochRunnerObstacleType[] =
      pattern === 'staggered-hop' ? ['amp-stack', 'noise-burst']
      : pattern === 'rising-hop' ? ['noise-burst', 'cab-wall']
      : pattern === 'duck-beam' ? ['signal-beam', 'signal-beam']
      : pattern === 'dash-cache' ? ['signal-tunnel', 'noise-burst']
      : pattern === 'mixed-gate' ? ['signal-beam', 'amp-stack']
      : pattern === 'final-sprint' ? ['amp-stack', 'signal-beam', 'noise-burst']
      : pattern === 'cab-hop' ? ['cab-wall']
      : pattern === 'low-burst' ? ['noise-burst']
      : pattern === 'duck-beam-tutorial' ? ['signal-beam']
      : pattern === 'dash-tunnel' ? ['signal-tunnel']
      : ['amp-stack']

    types.forEach((type, index) => {
      const offset = first + index * stride
      const isBeam = type === 'signal-beam' || type === 'signal-tunnel'
      hazard(offset, type)
      packet(offset + 15, isBeam ? 'ground' : 'hop', 5)
      // A high cache asks for a held jump; the primary is on the shorter safe arc.
      if (stage >= 2 && !isBeam && (pattern === 'epoch-bundle' || pattern === 'dash-cache')) packet(offset + 8, 'high', 10, true)
    })
    const last = first + (types.length - 1) * stride
    packet(last + 180, 'ground', primaryValue)
  }
  return { obstacles, collectibles, nextSpawnId: nextId }
}

function choosePattern(state: EpochRunnerState, rng: EpochRunnerRandom): EpochRunnerPatternKind {
  if (state.currentStage === 1 && state.patternsSpawnedInStage === 0) return 'epoch-line'
  if (state.currentStage === 1 && state.patternsSpawnedInStage === 1) return 'single-hop'
  if (state.currentStage === 3 && state.patternsSpawnedInStage === 0) return 'duck-beam-tutorial'
  if (state.currentStage === 5 && state.patternsSpawnedInStage === 0) return 'jump-dash'
  if (state.currentStage === 5 && state.stageEpochs >= state.stageTargetEpochs * 0.75) return 'final-sprint'
  return pickOne(getEpochRunnerStage(state.currentStage).patterns, rng)
}

function getNextPatternCooldownMs(state: EpochRunnerState, rng: EpochRunnerRandom): number {
  const config = getEpochRunnerStage(state.currentStage)
  const rampReduction = Math.min(160, state.stageDistance * 1.35)
  const min = Math.max(680, config.cooldownMinMs - rampReduction)
  const max = Math.max(min + 120, config.cooldownMaxMs - (rampReduction * 0.65))
  return randomBetween(min, max, rng)
}

function getPlayerHitBox(player: EpochRunnerPlayer): { x: number; y: number; width: number; height: number } {
  if (player.isDucking) {
    return {
      x: player.x + 6,
      y: player.y + PLAYER_HEIGHT - PLAYER_DUCK_HEIGHT + 3,
      width: player.width - 10,
      height: PLAYER_DUCK_HEIGHT - 7
    }
  }

  return {
    x: player.x + 6,
    y: player.y + 4,
    width: player.width - 12,
    height: player.height - 8
  }
}

function getObstacleHitBox(
  obstacle: EpochRunnerObstacle
): { x: number; y: number; width: number; height: number } {
  if (obstacle.type === 'signal-beam' || obstacle.type === 'signal-tunnel') {
    return {
      x: obstacle.x + 6,
      y: obstacle.y + 4,
      width: obstacle.width - 12,
      height: obstacle.height - 8
    }
  }

  return {
    x: obstacle.x + 4,
    y: obstacle.y + 4,
    width: obstacle.width - 8,
    height: obstacle.height - 6
  }
}

function getFailureCopy(type: EpochRunnerObstacleType): [string, string] {
  switch (type) {
    case 'signal-beam': return ['PHASE ALIGNMENT LOST', 'Hold S / DOWN as the beam reaches you. Watch the phase timer.']
    case 'signal-tunnel': return ['INTERFERENCE GATE HIT', 'Phase-slide through the tall gate. Start closer so the slide lasts through it.']
    case 'cab-wall': return ['ACTIVATION BLOCK HIT', 'Hold SPACE for a higher jump over the activation block.']
    case 'noise-burst': return ['CLIPPING SPIKE HIT', 'Jump the clipping spike. Release SPACE for a short hop.']
    case 'amp-stack': return ['GRADIENT COLLISION', 'Jump over the gradient block. Sliding only clears overhead interference.']
    case 'loss-plateau': return ['LOSS PLATEAU HIT', 'Hold SPACE, then hold S / DOWN near the top of your jump to dash across.']
  }
}

export function getEpochRunnerMultiplier(chain: number): number {
  return Math.min(4, 1 + Math.floor(chain / 5))
}

function createEvent(kind: EpochRunnerEventKind, label: string, value: number = 0, x: number = PLAYER_X, y: number = 100): EpochRunnerEvent {
  return { kind, label, value, x, y }
}

export function pauseEpochRunner(state: EpochRunnerState): EpochRunnerState {
  return state.status === 'running' ? { ...state, status: 'paused', events: [] } : state
}

export function resumeEpochRunner(state: EpochRunnerState): EpochRunnerState {
  return state.status === 'paused'
    ? { ...state, status: 'running', player: { ...state.player, jumpBufferMs: 0 }, events: [] }
    : state
}

function resolveStageComplete(previousState: EpochRunnerState): EpochRunnerState {
  const state = { ...previousState, score: previousState.score + 500 + (previousState.stageDeaths === 0 ? 500 : 0) }

  if (state.currentStage >= EPOCH_RUNNER_STAGE_COUNT) {
    return {
      ...state,
      status: 'won',
      outcome: 'won',
      score: state.score + 1400,
      events: [...state.events, createEvent('won', 'MODEL CONVERGED')],
      resultHeadline: 'MODEL CONVERGED',
      resultDetail: 'Reward preset unlocked.'
    }
  }

  if (state.currentStage === 2 && !state.duckDashUnlocked) {
    return {
      ...state,
      status: 'cutscene',
      events: [...state.events, createEvent('upgrade', 'OPTIMIZER UPGRADE')],
      resultHeadline: 'OPTIMIZER UPGRADE',
      resultDetail: 'Phase dash unlocked.'
    }
  }

  return {
    ...state,
    status: 'stage-complete',
    events: [...state.events, createEvent('stage-complete', 'CHECKPOINT WRITTEN')],
    resultHeadline: `${getEpochRunnerStage(state.currentStage).name} COMPLETE`,
    resultDetail: ''
  }
}

interface PlayerStep {
  player: EpochRunnerPlayer
  airDashSeconds: number
  airDashStarted: boolean
}

function stepPlayer(
  previousPlayer: EpochRunnerPlayer,
  input: EpochRunnerInput,
  deltaSeconds: number,
  deltaMs: number,
  duckDashUnlocked: boolean
): PlayerStep {
  const player = { ...previousPlayer }
  const groundPlayerY = GROUND_Y - player.height

  player.jumpBufferMs = input.jumpPressed ? JUMP_BUFFER_MS : Math.max(0, player.jumpBufferMs - deltaMs)
  player.coyoteTimeMs = player.isGrounded ? COYOTE_TIME_MS : Math.max(0, player.coyoteTimeMs - deltaMs)
  player.duckCooldownMs = Math.max(0, player.duckCooldownMs - deltaMs)
  player.duckDashMs = Math.max(0, player.duckDashMs - deltaMs)

  const canDuckDash = duckDashUnlocked && player.isGrounded && player.duckCooldownMs === 0
  if (input.duckPressed && canDuckDash && !input.jumpPressed) {
    player.duckDashMs = DUCK_DASH_DURATION_MS
    player.duckCooldownMs = DUCK_DASH_COOLDOWN_MS
  }

  if (player.duckDashMs > 0 && !input.duckHeld) {
    player.duckDashMs = 0
  }

  player.isDucking = duckDashUnlocked && player.isGrounded && player.duckDashMs > 0 && input.duckHeld

  const canJump = player.jumpBufferMs > 0 && (player.isGrounded || player.coyoteTimeMs > 0) && !player.isDucking
  if (canJump) {
    player.velocityY = JUMP_VELOCITY
    player.isGrounded = false
    player.isDucking = false
    player.jumpBufferMs = 0
    player.coyoteTimeMs = 0
  }

  const airDashStarted = duckDashUnlocked && input.duckPressed && input.duckHeld
    && !player.isGrounded && player.y < groundPlayerY && !player.airDashUsed
  if (airDashStarted) {
    player.airDashMs = AIR_DASH_DURATION_MS
    player.airDashUsed = true
    player.velocityY = 0
  }
  if (!input.duckHeld) player.airDashMs = 0
  const airDashSeconds = Math.min(deltaMs, player.airDashMs) / 1000
  player.airDashMs = Math.max(0, player.airDashMs - deltaMs)
  const gravitySeconds = deltaSeconds - airDashSeconds

  const gravityMultiplier = player.velocityY < 0 && !input.jumpHeld
    ? JUMP_RELEASE_GRAVITY_MULTIPLIER
    : player.velocityY > 0
      ? FALL_GRAVITY_MULTIPLIER
      : 1

  player.velocityY += GRAVITY * gravityMultiplier * gravitySeconds
  player.y += player.velocityY * gravitySeconds

  if (player.y >= groundPlayerY) {
    player.y = groundPlayerY
    player.velocityY = 0
    player.isGrounded = true
    player.coyoteTimeMs = COYOTE_TIME_MS
    player.airDashMs = 0
    player.airDashUsed = false
  }

  if (player.isGrounded && player.jumpBufferMs > 0 && !player.isDucking) {
    player.velocityY = JUMP_VELOCITY
    player.isGrounded = false
    player.isDucking = false
    player.jumpBufferMs = 0
    player.coyoteTimeMs = 0
  }

  const targetX = player.isDucking && duckDashUnlocked ? PLAYER_X + 24 : PLAYER_X
  player.x += (targetX - player.x) * Math.min(1, deltaSeconds * 16)

  if (!player.isGrounded) {
    player.isDucking = false
  }

  return { player, airDashSeconds, airDashStarted }
}

export function createInitialEpochRunnerState(): EpochRunnerState {
  return {
    status: 'ready',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    epochsCollected: 0,
    stageEpochs: 0,
    stageTargetEpochs: getStageTargetEpochs(1),
    stageTimeMs: 0,
    livesRemaining: EPOCH_RUNNER_STARTING_LIVES,
    score: 0,
    distance: 0,
    stageDistance: 0,
    stageStartEpochs: 0,
    stageStartScore: 0,
    timeMs: 0,
    speed: getEpochRunnerStage(1).baseSpeed,
    currentStage: 1,
    duckDashUnlocked: false,
    patternCooldownMs: 520,
    patternsSpawnedInStage: 0,
    nextSpawnId: 1,
    resultHeadline: '',
    resultDetail: '',
    chain: 0,
    maxChain: 0,
    stageDeaths: 0,
    failureObstacleId: null,
    events: []
  }
}

export function startEpochRunner(_state: EpochRunnerState): EpochRunnerState {
  return {
    ...createInitialEpochRunnerState(),
    status: 'running',
    patternCooldownMs: 420
  }
}

export function advanceEpochRunner(previousState: EpochRunnerState): EpochRunnerState {
  if (previousState.status !== 'stage-complete' && previousState.status !== 'cutscene') {
    return previousState
  }

  const nextStage = Math.min(EPOCH_RUNNER_STAGE_COUNT, previousState.currentStage + 1)

  return {
    ...previousState,
    status: 'running',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    currentStage: nextStage,
    stageEpochs: 0,
    stageTargetEpochs: getStageTargetEpochs(nextStage),
    stageTimeMs: 0,
    stageDistance: 0,
    stageStartEpochs: previousState.epochsCollected,
    stageStartScore: previousState.score,
    speed: getEpochRunnerStage(nextStage).baseSpeed,
    duckDashUnlocked: previousState.duckDashUnlocked || previousState.status === 'cutscene',
    patternCooldownMs: previousState.status === 'cutscene' ? 520 : 440,
    patternsSpawnedInStage: 0,
    resultHeadline: '',
    resultDetail: '',
    chain: 0,
    stageDeaths: 0,
    failureObstacleId: null,
    events: []
  }
}

export function retryEpochRunnerStage(previousState: EpochRunnerState): EpochRunnerState {
  if (previousState.status !== 'crashed' || previousState.livesRemaining <= 0) {
    return previousState
  }

  return {
    ...previousState,
    status: 'running',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    epochsCollected: previousState.stageStartEpochs,
    stageEpochs: 0,
    stageTimeMs: 0,
    stageDistance: 0,
    score: previousState.stageStartScore,
    speed: getEpochRunnerStage(previousState.currentStage).baseSpeed,
    patternCooldownMs: previousState.currentStage === 3 ? 520 : 440,
    patternsSpawnedInStage: 0,
    resultHeadline: '',
    resultDetail: '',
    chain: 0,
    failureObstacleId: null,
    events: []
  }
}

export function stepEpochRunner(
  previousState: EpochRunnerState,
  deltaMs: number,
  input: EpochRunnerInput = idleInput,
  options: EpochRunnerStepOptions = {}
): EpochRunnerState {
  if (previousState.status !== 'running') {
    return previousState
  }

  const rng = options.rng ?? Math.random
  const clampedDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, Math.min(MAX_DELTA_MS, deltaMs)) : 0
  const events: EpochRunnerEvent[] = []
  const deltaSeconds = clampedDeltaMs / 1000
  const stageConfig = getEpochRunnerStage(previousState.currentStage)
  const speed = stageConfig.baseSpeed + Math.min(stageConfig.maxSpeedBonus, previousState.stageDistance * stageConfig.speedRamp)
  const { player, airDashSeconds, airDashStarted } = stepPlayer(previousState.player, input, deltaSeconds, clampedDeltaMs, previousState.duckDashUnlocked)
  // The camera follows the forward burst, keeping the runner in the same lane.
  const travelPx = speed * deltaSeconds + AIR_DASH_SPEED * airDashSeconds
  const distanceGain = travelPx * 0.12
  const distance = previousState.distance + distanceGain
  const stageDistance = previousState.stageDistance + distanceGain
  const stageTimeMs = previousState.stageTimeMs + clampedDeltaMs

  if (airDashStarted || player.duckDashMs > previousState.player.duckDashMs) {
    events.push(createEvent('dash', 'PHASE SHIFT'))
  }
  let nextSpawnId = previousState.nextSpawnId
  const obstacles = previousState.obstacles
    .map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - travelPx
    }))
    .filter((obstacle) => obstacle.x + obstacle.width > -20)

  const collectibles = previousState.collectibles
    .map((collectible) => ({
      ...collectible,
      x: collectible.x - travelPx,
      bobPhase: collectible.bobPhase + (deltaSeconds * 4)
    }))
    .filter((collectible) => collectible.x + collectible.width > -20)

  let patternCooldownMs = previousState.patternCooldownMs - clampedDeltaMs
  let patternsSpawnedInStage = previousState.patternsSpawnedInStage
  if (patternCooldownMs <= 0) {
    const rightmostObstacleX = [...obstacles, ...collectibles].reduce((right, item) => Math.max(right, item.x + item.width), -Infinity)
    if (rightmostObstacleX > GAME_WIDTH - stageConfig.minPatternGapPx) {
      patternCooldownMs = PATTERN_RETRY_MS
    } else {
      const pattern = choosePattern(previousState, rng)
      const buildResult = buildEpochRunnerPattern(pattern, nextSpawnId, rng, previousState.currentStage)
      obstacles.push(...buildResult.obstacles)
      collectibles.push(...buildResult.collectibles)
      nextSpawnId = buildResult.nextSpawnId
      patternsSpawnedInStage += 1
      patternCooldownMs = getNextPatternCooldownMs(
        {
          ...previousState,
          stageDistance,
          patternsSpawnedInStage
        },
        rng
      )
    }
  }

  const playerHitBox = getPlayerHitBox(player)
  const collidedObstacle = obstacles.find((obstacle) => rectsOverlap(playerHitBox, getObstacleHitBox(obstacle)))
  if (collidedObstacle) {
    const [headline, detail] = getFailureCopy(collidedObstacle.type)
    const score = previousState.score
    const livesRemaining = Math.max(0, previousState.livesRemaining - 1)
    const isGameOver = livesRemaining === 0

    return {
      ...previousState,
      status: isGameOver ? 'game-over' : 'crashed',
      outcome: 'crashed',
      player,
      obstacles,
      collectibles,
      livesRemaining,
      speed,
      distance,
      stageDistance,
      stageTimeMs,
      timeMs: previousState.timeMs + clampedDeltaMs,
      score,
      patternCooldownMs,
      patternsSpawnedInStage,
      nextSpawnId,
      resultHeadline: isGameOver ? 'TRAINING RUN FAILED' : headline,
      resultDetail: detail,
      stageDeaths: previousState.stageDeaths + 1,
      chain: 0,
      failureObstacleId: collidedObstacle.id,
      events: [createEvent('crash', headline)]
    }
  }

  let epochsCollected = previousState.epochsCollected
  let stageEpochs = previousState.stageEpochs
  let score = previousState.score
  let chain = previousState.chain
  let maxChain = previousState.maxChain
  const remainingCollectibles: EpochRunnerCollectible[] = []

  for (const collectible of collectibles.sort((left, right) => left.x - right.x || left.id - right.id)) {
    if (rectsOverlap(playerHitBox, collectible)) {
      const remainingStageEpochs = Math.max(0, previousState.stageTargetEpochs - stageEpochs)
      const remainingTotalEpochs = Math.max(0, EPOCH_RUNNER_TARGET_EPOCHS - epochsCollected)
      const earnedEpochs = Math.min(collectible.value, remainingStageEpochs, remainingTotalEpochs)
      epochsCollected += earnedEpochs
      stageEpochs += earnedEpochs
      score += earnedEpochs * 100 * getEpochRunnerMultiplier(chain)
      events.push(createEvent('pickup', `${collectible.isBonus ? 'FEATURE CACHE' : 'EPOCH BUFFER'} +${String(earnedEpochs).padStart(3, '0')}`, earnedEpochs, collectible.x, collectible.y))
      if (!collectible.isBonus && earnedEpochs > 0) {
        const oldMultiplier = getEpochRunnerMultiplier(chain)
        chain += 1
        maxChain = Math.max(maxChain, chain)
        if (getEpochRunnerMultiplier(chain) > oldMultiplier) events.push(createEvent('chain', `GRADIENT STABLE / x${getEpochRunnerMultiplier(chain)}`))
      }
      continue
    }

    if (collectible.x + collectible.width < PLAYER_X + 6) {
      if (!collectible.isBonus && chain > 0) {
        chain = 0
        events.push(createEvent('chain-broken', 'SIGNAL CHAIN RESET'))
      }
      continue
    }
    remainingCollectibles.push(collectible)
  }


  const runningState: EpochRunnerState = {
    ...previousState,
    player,
    obstacles,
    collectibles: remainingCollectibles,
    epochsCollected,
    stageEpochs,
    stageTimeMs,
    score,
    chain,
    maxChain,
    events,
    distance,
    stageDistance,
    timeMs: previousState.timeMs + clampedDeltaMs,
    speed,
    patternCooldownMs,
    patternsSpawnedInStage,
    nextSpawnId
  }

  if (
    stageEpochs >= previousState.stageTargetEpochs
  ) {
    return resolveStageComplete(runningState)
  }

  return runningState
}
