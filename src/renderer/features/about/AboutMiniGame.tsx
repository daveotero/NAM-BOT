import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  EPOCH_RUNNER_STEP_MS, GAME_WIDTH, GAME_HEIGHT, advanceEpochRunner, createInitialEpochRunnerState,
  getEpochRunnerMultiplier, getEpochRunnerStage, pauseEpochRunner, resumeEpochRunner,
  retryEpochRunnerStage, startEpochRunner, stepEpochRunner,
  type EpochRunnerInput, type EpochRunnerState
} from './about-game-engine'
import { EpochRunnerAudio } from './about-game-audio'
import { renderEpochRunner, type EpochRunnerEffect } from './about-game-renderer'
import {
  loadEpochRunnerRecords, normalizeInitials, rankEpochRunnerScores, saveEpochRunnerRecords,
  type EpochRunnerRecords
} from './about-game-storage'
import { clearEpochRunnerSession, getEpochRunnerSession, suspendEpochRunnerSession } from './about-game-session'
import './about-game.css'

interface AboutMiniGameProps {
  isRewardUnlocked: boolean
  onExit: () => void
  onUnlockReward: () => Promise<void>
}

function emptyInput(): EpochRunnerInput {
  return { jumpPressed: false, jumpHeld: false, duckPressed: false, duckHeld: false }
}

function runtime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}

function isFinished(state: EpochRunnerState): boolean {
  return state.status === 'won' || state.status === 'game-over'
}

export default function AboutMiniGame({ isRewardUnlocked, onExit, onUnlockReward }: AboutMiniGameProps): JSX.Element {
  const sessionRef = useRef(getEpochRunnerSession())
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<EpochRunnerAudio | null>(null)
  const inputRef = useRef(emptyInput())
  const effectsRef = useRef<EpochRunnerEffect[]>([])
  const resetClockRef = useRef(true)
  const releaseRequiredRef = useRef(false)
  const aliveRef = useRef(false)
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  const [view, setView] = useState(sessionRef.current.state)
  const [records, setRecords] = useState(() => sessionRef.current.records ?? loadEpochRunnerRecords())
  const recordsRef = useRef(records)
  const [initials, setInitials] = useState(records.initials)
  const [scoresOpen, setScoresOpen] = useState(false)
  const scoresOpenRef = useRef(false)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const initialLock = sessionRef.current.state.status === 'cutscene' && !records.upgradeSeen ? Date.now() + 2600 : 0
  const [lockedUntil, setLockedUntil] = useState(initialLock)
  const lockedUntilRef = useRef(initialLock)

  const focusGame = useCallback((): void => { shellRef.current?.focus({ preventScroll: true }) }, [])

  const writeRecords = useCallback((next: EpochRunnerRecords): void => {
    recordsRef.current = next
    sessionRef.current.records = next
    setRecords(next)
    setStorageAvailable(saveEpochRunnerRecords(next))
  }, [])

  const setGameState = useCallback((next: EpochRunnerState): void => {
    const previous = sessionRef.current.state
    sessionRef.current.state = next
    if (previous.status !== next.status) {
      resetClockRef.current = true
      if (inputRef.current.jumpHeld) releaseRequiredRef.current = true
      inputRef.current = emptyInput()
      const delay = next.status === 'cutscene' && !recordsRef.current.upgradeSeen ? 2600 : 350
      const deadline = next.status === 'running' || next.status === 'paused' || next.status === 'ready' ? 0 : Date.now() + delay
      lockedUntilRef.current = deadline
      setLockedUntil(deadline)
    }
    if (isFinished(next) && !sessionRef.current.recorded) {
      sessionRef.current.recorded = true
      const current = recordsRef.current
      writeRecords({
        ...current,
        scores: rankEpochRunnerScores([...current.scores, {
          id: sessionRef.current.id, initials: current.initials, score: next.score,
          epochs: next.epochsCollected, timeMs: next.timeMs, outcome: next.status === 'won' ? 'won' : 'game-over'
        }])
      })
    }
    setView(next)
  }, [writeRecords])

  const activateAudio = useCallback((boot: boolean = false): void => {
    const audio = audioRef.current
    if (!audio || !recordsRef.current.soundEnabled) return
    void audio.enable(true).then((available) => {
      if (!aliveRef.current || !recordsRef.current.soundEnabled) return
      setAudioAvailable(available)
      if (sessionRef.current.state.status === 'paused' || document.hidden) audio.stop()
      else if (available && boot) audio.play('boot')
    })
  }, [])

  const toggleSound = useCallback((): void => {
    const next = { ...recordsRef.current, soundEnabled: !recordsRef.current.soundEnabled }
    writeRecords(next)
    if (next.soundEnabled) activateAudio(true)
    else void audioRef.current?.enable(false)
  }, [activateAudio, writeRecords])

  const pause = useCallback((): void => {
    inputRef.current = emptyInput()
    releaseRequiredRef.current = false
    audioRef.current?.stop()
    setGameState(pauseEpochRunner(sessionRef.current.state))
  }, [setGameState])

  const togglePause = useCallback((): void => {
    if (sessionRef.current.state.status === 'paused') {
      inputRef.current = emptyInput()
      setGameState(resumeEpochRunner(sessionRef.current.state))
      activateAudio()
    } else pause()
  }, [activateAudio, pause, setGameState])

  const exitGame = useCallback((): void => {
    audioRef.current?.stop()
    clearEpochRunnerSession()
    exitRef.current()
  }, [])

  const primaryAction = useCallback((): void => {
    if (Date.now() < lockedUntilRef.current) return
    const state = sessionRef.current.state
    setScoresOpen(false)
    scoresOpenRef.current = false
    setUnlockError(null)
    effectsRef.current = []
    if (state.status === 'ready' || isFinished(state)) {
      clearEpochRunnerSession()
      sessionRef.current = getEpochRunnerSession()
      sessionRef.current.records = recordsRef.current
      setGameState(startEpochRunner(createInitialEpochRunnerState()))
      activateAudio(true)
    } else if (state.status === 'cutscene' || state.status === 'stage-complete') {
      if (state.status === 'cutscene') writeRecords({ ...recordsRef.current, upgradeSeen: true })
      setGameState(advanceEpochRunner(state))
      activateAudio()
    } else if (state.status === 'crashed') {
      setGameState(retryEpochRunnerStage(state))
      activateAudio()
    } else if (state.status === 'paused') togglePause()
    focusGame()
  }, [activateAudio, focusGame, setGameState, togglePause, writeRecords])

  const toggleScores = useCallback((): void => {
    const state = sessionRef.current.state
    if (state.status !== 'ready' && !isFinished(state)) return
    scoresOpenRef.current = !scoresOpenRef.current
    setScoresOpen(scoresOpenRef.current)
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const timer = window.setTimeout(() => {
      lockedUntilRef.current = 0
      setLockedUntil(0)
    }, Math.max(0, lockedUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [lockedUntil])

  useEffect(() => {
    const handleDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        if (!event.repeat) exitGame()
        return
      }
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const key = event.key.toLowerCase()
      if (![' ', 's', 'arrowdown', 'p', 'm', 'h', 'escape'].includes(key)) return
      event.preventDefault()
      if (event.repeat) return
      if (key === 'escape') { exitGame(); return }
      if (key === 'm') { toggleSound(); return }
      if (key === 'p') {
        if (sessionRef.current.state.status === 'running' || sessionRef.current.state.status === 'paused') togglePause()
        return
      }
      if (key === 'h') { toggleScores(); return }
      if (key === ' ') {
        if (sessionRef.current.state.status === 'running') {
          inputRef.current.jumpPressed = true
          inputRef.current.jumpHeld = true
        } else if (!releaseRequiredRef.current && !scoresOpenRef.current) {
          releaseRequiredRef.current = true
          primaryAction()
        }
      } else if (sessionRef.current.state.status === 'running') {
        inputRef.current.duckPressed = true
        inputRef.current.duckHeld = true
      }
    }
    const handleUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') {
        inputRef.current.jumpHeld = false
        releaseRequiredRef.current = false
      }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') inputRef.current.duckHeld = false
    }
    const visibility = (): void => { if (document.hidden) pause() }
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [exitGame, pause, primaryAction, togglePause, toggleScores, toggleSound])

  useEffect(() => {
    aliveRef.current = true
    audioRef.current = new EpochRunnerAudio()
    focusGame()
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animationId = 0
    let lastTime: number | null = null
    let accumulator = 0
    let lastHud = 0
    let lastDrawn: EpochRunnerState | null = null
    let lastMotion = motion.matches
    const frame = (timestamp: number): void => {
      const elapsed = lastTime === null || resetClockRef.current ? 0 : Math.min(100, Math.max(0, timestamp - lastTime))
      if (resetClockRef.current) accumulator = 0
      resetClockRef.current = false
      lastTime = timestamp
      if (sessionRef.current.state.status === 'running') {
        accumulator += elapsed
        while (accumulator >= EPOCH_RUNNER_STEP_MS && sessionRef.current.state.status === 'running') {
          accumulator -= EPOCH_RUNNER_STEP_MS
          const previous = sessionRef.current.state
          const next = stepEpochRunner(previous, EPOCH_RUNNER_STEP_MS, inputRef.current)
          inputRef.current.jumpPressed = false
          inputRef.current.duckPressed = false
          const played = new Set<string>()
          for (const event of next.events) {
            effectsRef.current.push({ event, bornAt: next.timeMs })
            if (!played.has(event.kind)) audioRef.current?.play(event.kind)
            played.add(event.kind)
          }
          if (next.status !== previous.status) setGameState(next)
          else sessionRef.current.state = next
        }
      } else accumulator = 0
      const current = sessionRef.current.state
      effectsRef.current = effectsRef.current.filter((effect) => current.timeMs - effect.bornAt <= 850).slice(-12)
      if (lastDrawn !== current || lastMotion !== motion.matches) {
        renderEpochRunner(context, current, effectsRef.current, motion.matches)
        lastDrawn = current
        lastMotion = motion.matches
      }
      if (timestamp - lastHud >= 100) {
        setView(current)
        lastHud = timestamp
      }
      animationId = window.requestAnimationFrame(frame)
    }
    animationId = window.requestAnimationFrame(frame)
    return () => {
      aliveRef.current = false
      window.cancelAnimationFrame(animationId)
      audioRef.current?.dispose()
      audioRef.current = null
      inputRef.current = emptyInput()
      suspendEpochRunnerSession()
    }
  }, [focusGame, setGameState])

  const changeInitials = (value: string): void => {
    const normalized = normalizeInitials(value)
    setInitials(normalized)
    writeRecords({
      ...recordsRef.current, initials: normalized || 'BOT',
      scores: recordsRef.current.scores.map((score) => score.id === sessionRef.current.id ? { ...score, initials: normalized || 'BOT' } : score)
    })
  }

  const unlockReward = async (): Promise<void> => {
    setUnlocking(true)
    setUnlockError(null)
    try {
      await onUnlockReward()
    } catch (error) {
      if (aliveRef.current) setUnlockError(error instanceof Error ? error.message : String(error))
    } finally {
      if (aliveRef.current) setUnlocking(false)
    }
  }

  const stage = getEpochRunnerStage(view.currentStage)
  const finished = isFinished(view)
  const showOverlay = view.status !== 'running'
  const locked = lockedUntil > Date.now()
  const action = view.status === 'ready' ? 'START' : view.status === 'paused' ? 'RESUME'
    : view.status === 'crashed' ? 'RETRY STAGE' : finished ? 'PLAY AGAIN' : 'NEXT STAGE'
  const overlayTitle = scoresOpen ? 'TRAINING RECORDS' : view.status === 'ready' ? 'HOW TO PLAY'
    : view.status === 'paused' ? 'PAUSED' : view.resultHeadline
  const statusMessage = !storageAvailable ? 'Archive unavailable. Scores are kept until you exit.'
    : !audioAvailable ? 'Audio unavailable.' : view.status === 'running' ? stage.instruction : ''

  return (
    <div className="epoch-runner-shell" ref={shellRef} tabIndex={-1}
      data-status={view.status} data-stage={view.currentStage} data-runtime={Math.round(view.timeMs)}>
      <header className="epoch-runner-header">
        <h2>EPOCH RUNNER<span className="epoch-cursor">_</span></h2>
      </header>
      <div className="epoch-stage-heading">
        <div><span className="epoch-dim">PASS {String(view.currentStage).padStart(2, '0')} / 05</span><strong>{stage.name}</strong></div>
      </div>
      <div className="epoch-runner-stage">
        <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} className="epoch-runner-canvas"
          aria-label={'Epoch Runner playfield: ' + stage.name} />
        {showOverlay && (
          <div className={'epoch-runner-overlay ' + (view.status === 'crashed' ? 'epoch-crash-overlay' : '')}>
            <div className="epoch-overlay-panel">
              <h3 aria-live="polite">{overlayTitle}</h3>
              {scoresOpen ? (
                <div className="epoch-score-scroll">
                  <table className="epoch-score-table">
                    <thead><tr><th>#</th><th>ID</th><th>SCORE</th><th>EPOCHS</th><th>TIME</th><th>RESULT</th></tr></thead>
                    <tbody>{records.scores.map((score, index) => (
                      <tr key={score.id}><td>{String(index + 1).padStart(2, '0')}</td><td>{score.initials}</td><td>{score.score.toLocaleString()}</td><td>{score.epochs}</td><td>{runtime(score.timeMs)}</td><td>{score.outcome === 'won' ? 'CONVERGED' : 'DIVERGED'}</td></tr>
                    ))}</tbody>
                  </table>
                  {records.scores.length === 0 && <p>No scores yet.</p>}
                  {records.legacyBest > 0 && <p className="epoch-dim">Legacy best: {records.legacyBest.toLocaleString()} / previous scoring system</p>}
                </div>
              ) : view.status === 'ready' ? (
                <>
                  <p>Collect 666 epochs across five stages.</p>
                  <div className="epoch-briefing"><span><b>SPACE</b> jump · hold for height</span><span><b>3 LIVES</b> checkpoints between stages</span><span><b>STABILITY</b> chain pickups for up to ×4</span><span><b>+10 CACHES</b> optional bonus pickups</span></div>
                </>
              ) : view.status === 'paused' ? (
                <p>Press P to resume.</p>
              ) : (
                <>
                  {view.resultDetail && <p>{view.resultDetail}</p>}
                  {view.status === 'cutscene' && (
                    <div className="epoch-upgrade" aria-label="Phase shift optimizer upgrade">
                      <span className="epoch-upgrade-art" aria-hidden="true">[ ░▒▓  →  ▓▒░ ]</span>
                      <span>Hold S / DOWN to slide, or dash once per jump.<br />Release to cancel. Land to recharge the air dash.</span>
                    </div>
                  )}
                  <div className="epoch-report">
                    <span>EPOCH BUFFER <b>{view.epochsCollected} / 666</b></span>
                    <span>ACTIVE TIME <b>{runtime(view.timeMs)}</b></span>
                    <span>{view.status === 'crashed' || view.status === 'game-over' ? 'LIVES REMAINING' : 'PASS QUALITY'} <b>{view.status === 'crashed' || view.status === 'game-over' ? view.livesRemaining : view.stageDeaths === 0 ? 'CLEAN +500' : 'RECOVERED'}</b></span>
                  </div>
                  {finished && <label className="epoch-initials">INITIALS <input aria-label="Score initials" value={initials} maxLength={3} onChange={(event) => changeInitials(event.target.value)} onBlur={() => setInitials(recordsRef.current.initials)} spellCheck={false} /></label>}
                  {view.status === 'won' && <button type="button" className="epoch-button epoch-reward" disabled={isRewardUnlocked || unlocking} onClick={() => void unlockReward()}>{isRewardUnlocked ? 'REWARD PRESET IN LIBRARY' : unlocking ? 'ADDING REWARD...' : 'ADD REWARD PRESET'}</button>}
                  {unlockError && <p role="alert">{unlockError}</p>}
                </>
              )}
              <div className="epoch-overlay-actions">
                {scoresOpen ? <button type="button" className="epoch-button" onClick={() => { toggleScores(); focusGame() }}>[H] BACK</button>
                  : <button type="button" className="epoch-button epoch-primary" disabled={locked} onClick={primaryAction}>{'[SPACE] ' + action}</button>}
                {!scoresOpen && (view.status === 'ready' || finished) && <button type="button" className="epoch-button" onClick={() => { toggleScores(); focusGame() }}>[H] RECORDS</button>}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="epoch-buffer-row">
        <span>PASS BUFFER</span><progress aria-label="Stage epochs" value={view.stageEpochs} max={view.stageTargetEpochs} /><strong>{view.stageEpochs} / {view.stageTargetEpochs}</strong>
      </div>
      <div className="epoch-hud" aria-label="Training statistics">
        <div><span>LIVES</span><strong aria-label={view.livesRemaining + ' lives'}>{'■ '.repeat(view.livesRemaining)}<i>{'□ '.repeat(3 - view.livesRemaining)}</i></strong></div>
        <div><span>STABILITY</span><strong>×{getEpochRunnerMultiplier(view.chain)} <small>{view.chain} CHAIN</small></strong></div>
        <div><span>SCORE</span><strong>{view.score.toLocaleString()}</strong></div>
        <div><span>BEST</span><strong>{(records.scores[0]?.score ?? 0).toLocaleString()}</strong></div>
        <div><span>RUNTIME</span><strong>{runtime(view.timeMs)}</strong></div>
      </div>
      <footer className="epoch-controls">
        <span>SPACE jump {view.duckDashUnlocked ? ' / S ↓ dash' : ''}</span>
        <div>
          <button type="button" disabled={view.status !== 'running' && view.status !== 'paused'} onClick={() => { togglePause(); focusGame() }}>[P] {view.status === 'paused' ? 'RESUME' : 'PAUSE'}</button>
          <button type="button" aria-pressed={records.soundEnabled} onClick={() => { toggleSound(); focusGame() }}>[M] SOUND {records.soundEnabled ? 'ON' : 'OFF'}</button>
          <button type="button" onClick={exitGame}>[ESC] EXIT</button>
        </div>
      </footer>
      {statusMessage && <div className="epoch-status-line" role="status">{statusMessage}</div>}
    </div>
  )
}
