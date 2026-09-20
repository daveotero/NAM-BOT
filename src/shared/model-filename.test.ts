import { describe, expect, it } from 'vitest'

import { buildModelFilename, buildSnapshotFilename } from './model-filename'
import { defaultJobSpec } from './training'

const job = { ...defaultJobSpec, id: '12345678-abcd', name: '6534 Pedals', presetId: 'studio' }

describe('model filenames shared by preview and export', () => {
  it.each([
    [false, false, '6534 Pedals.nam'],
    [true, false, '6534 Pedals - Studio.nam'],
    [false, true, '6534 Pedals - ESR 0.0123.nam'],
    [true, true, '6534 Pedals - Studio - ESR 0.0123.nam']
  ] as const)('preserves suffix order with preset=%s and ESR=%s', (preset, esr, expected) => {
    expect(buildModelFilename({ ...job, appendPresetToModelFileName: preset, appendEsrToModelFileName: esr }, 'Studio', 0.012345)).toBe(expected)
  })

  it('uses an explicit pending ESR in previews without inventing a training result', () => {
    const withEsr = { ...job, appendEsrToModelFileName: true, appendPresetToModelFileName: false }
    expect(buildModelFilename(withEsr, 'Studio', 'pending')).toBe('6534 Pedals - ESR [pending].nam')
    expect(buildModelFilename(withEsr, 'Studio')).toBe('6534 Pedals.nam')
    expect(buildModelFilename(withEsr, 'Studio', 0)).toBe('6534 Pedals - ESR 0.0000.nam')
  })

  it('sanitizes job and preset segments just as the published file does', () => {
    expect(buildModelFilename({ ...job, name: ' Amp: A/B... ', appendPresetToModelFileName: false, appendEsrToModelFileName: false })).toBe('Amp- A-B.nam')
    expect(buildModelFilename({ ...job, name: 'Amp', appendPresetToModelFileName: true, appendEsrToModelFileName: true }, 'Preset / "A"', 0.001)).toBe('Amp - Preset - -A- - ESR 0.0010.nam')
    expect(buildModelFilename({ ...job, name: ' ... ', appendPresetToModelFileName: false, appendEsrToModelFileName: false })).toBe('job-12345678.nam')
  })

  it('omits unavailable preset names and does not use the embedded metadata name', () => {
    const namedJob = { ...job, metadata: { name: 'Embedded display name' }, appendPresetToModelFileName: true, appendEsrToModelFileName: false }
    expect(buildModelFilename(namedJob, null)).toBe('6534 Pedals.nam')
  })
})

describe('snapshot filenames', () => {
  const date = new Date(2026, 0, 2, 3, 4, 5, 987)

  it.each([
    [false, false, '6534 Pedals'],
    [true, false, '6534 Pedals - Studio'],
    [false, true, '6534 Pedals - ESR 0.0123'],
    [true, true, '6534 Pedals - Studio - ESR 0.0123']
  ] as const)('respects preset=%s and ESR=%s with a local timestamp to the second', (preset, esr, stem) => {
    expect(buildSnapshotFilename({ ...job, appendPresetToModelFileName: preset, appendEsrToModelFileName: esr }, date, 'Studio', 0.012345))
      .toBe(`${stem} - Snapshot 2026-01-02 03-04-05.nam`)
  })

  it('omits unavailable addendums and sanitizes names', () => {
    const namedJob = { ...job, name: 'Amp:/\nTest', appendPresetToModelFileName: true, appendEsrToModelFileName: true }
    expect(buildSnapshotFilename(namedJob, date, null, null)).toBe('Amp-Test - Snapshot 2026-01-02 03-04-05.nam')
    expect(buildSnapshotFilename(namedJob, date, 'Studio', 0)).toBe('Amp-Test - Studio - ESR 0.0000 - Snapshot 2026-01-02 03-04-05.nam')
  })
})
