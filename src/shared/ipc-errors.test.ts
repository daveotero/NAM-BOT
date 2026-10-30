import { describe, expect, it } from 'vitest'

import { stripIpcErrorPrefix } from './ipc-errors'

describe('IPC error messages', () => {
  it('keeps only the message thrown in the main process', () => {
    expect(stripIpcErrorPrefix("Error invoking remote method 'jobs:forceStop': Error: Simulated stop failure")).toBe('Simulated stop failure')
    expect(stripIpcErrorPrefix("Error invoking remote method 'presets:save': TypeError: Bad preset")).toBe('Bad preset')
    expect(stripIpcErrorPrefix("Error invoking remote method 'jobs:enqueue': Training is disabled")).toBe('Training is disabled')
  })

  it('leaves other messages unchanged', () => {
    expect(stripIpcErrorPrefix('Could not save: Error: disk full')).toBe('Could not save: Error: disk full')
  })
})
