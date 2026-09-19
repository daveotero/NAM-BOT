import type { EpochRunnerEventKind } from './about-game-engine'

interface Tone {
  frequency: number
  duration: number
}

const cues: Partial<Record<EpochRunnerEventKind | 'boot', Tone[]>> = {
  pickup: [{ frequency: 880, duration: 0.035 }, { frequency: 1320, duration: 0.045 }],
  chain: [{ frequency: 660, duration: 0.055 }, { frequency: 990, duration: 0.08 }],
  dash: [{ frequency: 180, duration: 0.035 }, { frequency: 360, duration: 0.04 }],
  crash: [{ frequency: 160, duration: 0.07 }, { frequency: 80, duration: 0.12 }],
  upgrade: [{ frequency: 440, duration: 0.08 }, { frequency: 660, duration: 0.08 }, { frequency: 880, duration: 0.15 }],
  'stage-complete': [{ frequency: 660, duration: 0.07 }, { frequency: 880, duration: 0.12 }],
  won: [{ frequency: 440, duration: 0.09 }, { frequency: 550, duration: 0.09 }, { frequency: 660, duration: 0.09 }, { frequency: 880, duration: 0.2 }],
  boot: [{ frequency: 1200, duration: 0.045 }, { frequency: 900, duration: 0.045 }, { frequency: 1500, duration: 0.06 }]
}

export class EpochRunnerAudio {
  private context: AudioContext | null = null
  private voices = new Set<OscillatorNode>()
  private enabled = false
  private disposed = false

  /** Called only from a user gesture. Audio is optional even when the device fails. */
  async enable(enabled: boolean): Promise<boolean> {
    this.enabled = enabled
    if (!enabled) {
      this.stop()
      return true
    }
    try {
      if (this.disposed || typeof AudioContext === 'undefined') return false
      this.context ??= new AudioContext()
      await this.context.resume()
      return !this.disposed && this.enabled
    } catch {
      this.enabled = false
      return false
    }
  }

  play(kind: EpochRunnerEventKind | 'boot'): void {
    const context = this.context
    const tones = cues[kind]
    if (!this.enabled || !context || context.state !== 'running' || !tones) return
    if (this.voices.size > 8) return
    try {
      let at = context.currentTime
      for (const tone of tones) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'square'
        oscillator.frequency.value = tone.frequency
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(0.018, at + 0.004)
        gain.gain.linearRampToValueAtTime(0, at + tone.duration)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.onended = (): void => {
          this.voices.delete(oscillator)
          oscillator.disconnect()
          gain.disconnect()
        }
        this.voices.add(oscillator)
        oscillator.start(at)
        oscillator.stop(at + tone.duration + 0.005)
        at += tone.duration
      }
    } catch {
      this.stop()
    }
  }

  stop(): void {
    for (const voice of this.voices) {
      try { voice.stop() } catch { /* A scheduled voice may already have ended. */ }
    }
    this.voices.clear()
    if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined)
  }

  dispose(): void {
    this.disposed = true
    this.enabled = false
    this.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined)
    this.context = null
  }
}
