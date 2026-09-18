import { describe, expect, it } from 'vitest'
import { getSectionLabel, getTitleBarActivity } from './title-bar-state'

describe('compact title bar content', () => {
  it('shows active work ahead of a pending queue pause', () => {
    expect(getTitleBarActivity([], { pauseReason: null })).toBe('Idle')
    expect(getTitleBarActivity([{ status: 'queued' }], { pauseReason: 'restart' })).toBe('Queue Paused')
    for (const status of ['validating', 'preparing', 'running', 'stopping'] as const) {
      expect(getTitleBarActivity([{ status }], { pauseReason: 'restart' })).toBe('Training')
    }
    expect(getTitleBarActivity([{ status: 'finalizing' }], { pauseReason: 'restart' })).toBe('Finalizing')
    expect(getTitleBarActivity([{ status: 'succeeded' }], { pauseReason: null })).toBe('Idle')
  })
  it('provides readable section titles', () => {
    expect(getSectionLabel('/help')).toBe('Setup Guide')
    expect(getSectionLabel('/')).toBe('Dashboard')
  })
})
