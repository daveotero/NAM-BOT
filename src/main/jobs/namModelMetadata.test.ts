import { describe, expect, it } from 'vitest'
import {
  buildUpdatedNamModelMetadata,
  hasNamModelMetadataUpdates,
  type NamExportDateMetadata
} from './namModelMetadata'

const exportDate: NamExportDateMetadata = {
  year: 2026,
  month: 5,
  day: 2,
  hour: 12,
  minute: 30,
  second: 45
}

describe('NAM model metadata updates', () => {
  it('writes NAM-BOT fields outside the official training object', () => {
    const metadata = buildUpdatedNamModelMetadata({
      currentMetadata: {
        date: { year: 2025 },
        loudness: -20.1,
        gain: 0.7,
        training: {
          nam_bot: {
            legacy_field: true
          }
        }
      },
      metadataPatch: {
        name: 'Amp Stack',
        modeled_by: 'Dave'
      },
      confirmedTrainingMetadata: {
        validationEsr: 0.01006,
        manualLatency: 0,
        trainedEpochs: 100,
        presetName: 'Standard WaveNet'
      },
      exportDate
    })

    expect(metadata).toEqual({
      loudness: -20.1,
      gain: 0.7,
      date: exportDate,
      name: 'Amp Stack',
      modeled_by: 'Dave',
      training: {
        validation_esr: 0.01006
      },
      nam_bot: {
        legacy_field: true,
        trained_epochs: 100,
        preset_name: 'Standard WaveNet',
        manual_latency_samples: 0
      }
    })
  })

  it('migrates legacy training.nam_bot metadata while preserving top-level custom fields', () => {
    const metadata = buildUpdatedNamModelMetadata({
      currentMetadata: {
        nam_bot: {
          preset_name: 'Top Level Preset',
          existing_custom_field: 'keep me'
        },
        training: {
          validation_esr: 0.2,
          nam_bot: {
            preset_name: 'Legacy Preset',
            legacy_custom_field: 'keep legacy'
          }
        }
      },
      metadataPatch: {},
      confirmedTrainingMetadata: {
        trainedEpochs: 12,
        presetName: 'New Preset'
      },
      exportDate
    })

    expect(metadata.training).toEqual({
      validation_esr: 0.2
    })
    expect(metadata.nam_bot).toEqual({
      preset_name: 'New Preset',
      legacy_custom_field: 'keep legacy',
      existing_custom_field: 'keep me',
      trained_epochs: 12
    })
  })

  it('preserves official training metadata and only updates known official fields', () => {
    const metadata = buildUpdatedNamModelMetadata({
      currentMetadata: {
        training: {
          settings: {
            ignore_checks: false
          },
          data: {
            latency: {
              manual: 8,
              calibration: {
                algorithm_version: 1
              }
            },
            checks: {
              version: 3,
              passed: true
            }
          },
          validation_esr: null
        }
      },
      metadataPatch: {},
      confirmedTrainingMetadata: {
        validationEsr: 0.03,
        manualLatency: 0
      },
      exportDate
    })

    expect(metadata.training).toEqual({
      settings: {
        ignore_checks: false
      },
      data: {
        latency: {
          manual: 0,
          calibration: {
            algorithm_version: 1
          }
        },
        checks: {
          version: 3,
          passed: true
        }
      },
      validation_esr: 0.03
    })
    expect(metadata.nam_bot).toEqual({
      manual_latency_samples: 0
    })
  })

  it('treats zero manual latency as metadata worth preserving', () => {
    expect(hasNamModelMetadataUpdates({}, { manualLatency: 0 })).toBe(true)
  })
})
