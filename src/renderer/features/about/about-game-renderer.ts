import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_Y, DUCK_DASH_DURATION_MS, AIR_DASH_DURATION_MS,
  type EpochRunnerState, type EpochRunnerObstacle, type EpochRunnerEvent
} from './about-game-engine'

export interface EpochRunnerEffect {
  event: EpochRunnerEvent
  bornAt: number
}

const ink = '#b6ffc2'
const bright = '#e0ffe4'
const green = '#67df85'
const hazardRed = '#ff5364'
const hazardBright = '#ffb1b8'
const dim = '#1c5a34'
const black = '#04100a'

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = ink): void {
  ctx.fillStyle = color
  ctx.font = '10px Consolas, monospace'
  ctx.fillText(text, Math.round(x), Math.round(y))
}

function drawEnvironment(ctx: CanvasRenderingContext2D, state: EpochRunnerState, reducedMotion: boolean): void {
  const scroll = reducedMotion ? 0 : state.distance * 0.7
  ctx.strokeStyle = dim
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5
  if (state.currentStage === 1) {
    // Capture traces and alignment rulers.
    for (let row = 0; row < 3; row++) {
      ctx.beginPath()
      for (let x = 0; x <= GAME_WIDTH; x += 4) {
        const y = 60 + row * 48 + Math.sin((x + scroll) / 19) * Math.sin((x + scroll) / 57) * 17
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    for (let x = 20; x < GAME_WIDTH; x += 48) rect(ctx, x, 22, 1, 6, green)
  } else if (state.currentStage === 2) {
    // Dilated paths between learned layers.
    for (let column = -1; column < 10; column++) {
      const x = column * 100 - scroll % 100
      for (let row = 0; row < 4; row++) {
        const y = 46 + row * 40
        rect(ctx, x, y, 5, 5, green)
        ctx.beginPath()
        ctx.moveTo(x + 5, y + 2)
        ctx.lineTo(x + 100, 46 + ((row + column + 12) % 4) * 40)
        ctx.stroke()
      }
    }
  } else if (state.currentStage === 3) {
    // Gradient vectors descend through an optimizer field.
    for (let x = -30; x < GAME_WIDTH + 60; x += 60) {
      for (let row = 0; row < 4; row++) {
        const px = x - scroll % 60
        const y = 35 + row * 43
        ctx.beginPath()
        ctx.moveTo(px, y)
        ctx.lineTo(px + 20, y + 22)
        ctx.lineTo(px + 12, y + 20)
        ctx.moveTo(px + 20, y + 22)
        ctx.lineTo(px + 20, y + 14)
        ctx.stroke()
      }
    }
  } else {
    // Reference and model traces align as convergence approaches.
    const error = state.currentStage === 4 ? 18 : 14 * (1 - state.stageEpochs / state.stageTargetEpochs)
    for (let layer = 0; layer < 3; layer++) {
      for (let trace = 0; trace < 2; trace++) {
        ctx.setLineDash(trace ? [3, 5] : [])
        ctx.beginPath()
        for (let x = 0; x <= GAME_WIDTH; x += 4) {
          const y = 56 + layer * 50 + Math.sin((x + scroll) / 28) * 12 + trace * Math.sin(x / 65) * error
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
  // Subtle equipment silhouettes frame the signal path without masking hazards.
  for (let i = 0; i < 12; i++) {
    const x = i * 86 - (scroll * 0.4) % 86
    rect(ctx, x, GROUND_Y - 20 - (i % 3) * 8, 40, 44, '#092517')
    rect(ctx, x + 5, GROUND_Y - 15 - (i % 3) * 8, 10, 2, dim)
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: EpochRunnerObstacle, failed: boolean): void {
  const { x, y, width, height, type } = obstacle
  const color = failed ? hazardBright : hazardRed
  ctx.save()
  ctx.shadowColor = '#ff334d88'
  ctx.shadowBlur = 4
  if (type === 'signal-beam' || type === 'signal-tunnel') {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(Math.round(x), Math.round(y), width, height)
    for (let row = 4; row < height - 4; row += 10) rect(ctx, x + 3, y + row, width - 6, 3, hazardBright)
    label(ctx, 'v PHASE v', x + 3, y - 7, hazardBright)
  } else if (type === 'loss-plateau') {
    rect(ctx, x, y, width, height, color)
    rect(ctx, x + 2, y + 3, width - 4, height - 5, black)
    for (let column = 5; column < width - 4; column += 12) {
      rect(ctx, x + column, y + 5, 3, height - 8, color)
      rect(ctx, x + column + 3, y + 5, 5, 3, hazardBright)
    }
    label(ctx, 'JUMP + DASH >>', x + 5, y - 10, hazardBright)
  } else if (type === 'noise-burst') {
    for (let column = 0; column < width; column += 6) {
      const spikeHeight = column % 12 === 0 ? height : height - 9
      rect(ctx, x + column, y + height - spikeHeight, 4, spikeHeight, color)
    }
  } else {
    rect(ctx, x, y, width, height, color)
    rect(ctx, x + 3, y + 3, width - 6, height - 6, black)
    const rows = type === 'cab-wall' ? 4 : 3
    for (let row = 0; row < rows; row++) {
      rect(ctx, x + 6, y + 7 + row * 10, width - 12, 3, color)
      rect(ctx, x + 8 + row * 5, y + 6 + row * 10, 4, 5, hazardBright)
    }
  }
  if (failed) {
    ctx.strokeStyle = hazardBright
    ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(x - 5), Math.round(y - 5), width + 10, height + 10)
    ctx.setLineDash([])
  }
  ctx.restore()
  // Safe clearance stays green, separate from the red gate above it.
  if (type === 'signal-beam' || type === 'signal-tunnel') {
    for (let px = 2; px < width; px += 12) rect(ctx, x + px, GROUND_Y - 3, 6, 2, ink)
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: EpochRunnerState, reducedMotion: boolean): void {
  const { player } = state
  const x = Math.round(player.x)
  const y = Math.round(player.y)
  const pulse = player.isGrounded && !reducedMotion ? Math.floor(state.timeMs / 90) % 2 : 0
  rect(ctx, x + 4, GROUND_Y - 2, 28, 2, dim)
  if (player.airDashMs > 0) {
    if (!reducedMotion) {
      rect(ctx, x - 42, y + 12, 28, 3, dim)
      rect(ctx, x - 28, y + 22, 23, 4, green)
      rect(ctx, x - 38, y + 32, 28, 3, dim)
    }
    rect(ctx, x + 4, y + 9, 22, 25, green)
    rect(ctx, x + 19, y + 6, 14, 15, bright)
    rect(ctx, x + 26, y + 10, 7, 5, black)
    rect(ctx, x, y + 27, 17, 8, ink)
    rect(ctx, x + 22, y + 25, 11, 5, ink)
    return
  }
  if (player.isDucking) {
    if (!reducedMotion) {
      rect(ctx, x - 24, y + 28, 19, 3, dim)
      rect(ctx, x - 14, y + 35, 13, 3, green)
    }
    rect(ctx, x + 4, y + 21, 27, 15, green)
    rect(ctx, x + 17, y + 18, 12, 9, bright)
    rect(ctx, x + 22, y + 21, 6, 3, black)
    rect(ctx, x + 1, y + 36, 33, 4, bright)
    return
  }
  rect(ctx, x + 7, y + 2, 21, 13, ink)
  rect(ctx, x + 10, y + 6, 15, 5, black)
  rect(ctx, x + 19, y + 7, 5, 3, bright)
  rect(ctx, x + 5, y + 17, 23, 15, green)
  rect(ctx, x + 12, y + 20, 10, 7, black)
  rect(ctx, x + 16, y + 21, 2, 5, bright)
  rect(ctx, x + 1, y + 18, 4, 12, ink)
  rect(ctx, x + 29, y + 18, 4, 9, ink)
  rect(ctx, x + 7, y + 33, 7, pulse ? 5 : 9, ink)
  rect(ctx, x + 21, y + 33, 7, pulse ? 9 : 5, ink)
}

export function renderEpochRunner(
  ctx: CanvasRenderingContext2D, state: EpochRunnerState, effects: EpochRunnerEffect[], reducedMotion: boolean
): void {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  rect(ctx, 0, 0, GAME_WIDTH, GAME_HEIGHT, black)
  drawEnvironment(ctx, state, reducedMotion)
  rect(ctx, 0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, '#0a2618')
  rect(ctx, 0, GROUND_Y, GAME_WIDTH, 1, green)
  const scroll = reducedMotion ? 0 : state.distance * 6
  for (let x = -40; x < GAME_WIDTH + 40; x += 40) rect(ctx, x - scroll % 40, GROUND_Y + 10, 20, 2, dim)

  for (const packet of state.collectibles) {
    const { x, y, width, height } = packet
    ctx.strokeStyle = packet.isBonus ? bright : green
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(x), Math.round(y), width, height)
    if (packet.isBonus) ctx.strokeRect(Math.round(x + 3), Math.round(y + 3), width - 6, height - 6)
    else rect(ctx, x, y, 3, 3, bright)
    label(ctx, '+' + packet.value, x + (packet.value === 10 ? 4 : 6), y + 17, bright)
  }
  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.failureObstacleId === obstacle.id)
  drawPlayer(ctx, state, reducedMotion)

  if (state.duckDashUnlocked) {
    const fraction = state.player.airDashMs > 0
      ? state.player.airDashMs / AIR_DASH_DURATION_MS : state.player.duckDashMs / DUCK_DASH_DURATION_MS
    const spent = !state.player.isGrounded && state.player.airDashUsed && fraction === 0
    label(ctx, fraction > 0 ? 'PHASE ACTIVE' : spent ? 'AIR USED' : 'PHASE READY', 14, GAME_HEIGHT - 12)
    rect(ctx, 112, GAME_HEIGHT - 19, 84, 8, dim)
    rect(ctx, 112, GAME_HEIGHT - 19, 84 * (fraction > 0 ? fraction : spent ? 0 : 1), 8, fraction > 0 ? bright : green)
  }
  label(ctx, 'EPOCHS / ' + String(state.epochsCollected).padStart(3, '0') + ' OF 666', GAME_WIDTH - 175, GAME_HEIGHT - 12)

  if (state.currentStage === 3 && state.stageEpochs < 10 && state.status === 'running') {
    label(ctx, 'HOLD S / DOWN AT THE BEAM  >>', 245, 38, bright)
  }
  for (const effect of effects) {
    const age = state.timeMs - effect.bornAt
    if (age < 0 || age > 850 || effect.event.kind === 'dash' || effect.event.kind === 'chain') continue
    const { event } = effect
    const x = Math.max(14, Math.min(540, event.x))
    const y = Math.max(45, event.y - 8 - (reducedMotion ? 0 : age / 40))
    ctx.globalAlpha = Math.min(1, (850 - age) / 220)
    label(ctx, event.kind === 'pickup' ? '+' + event.value : event.label, x, y, bright)
    if (!reducedMotion && event.kind === 'pickup') {
      for (let i = 0; i < 4; i++) {
        rect(ctx, event.x + Math.cos(i * 1.7) * age / 24, event.y + Math.sin(i * 1.7) * age / 24, 2, 2, ink)
      }
    }
    ctx.globalAlpha = 1
  }
}
