import { describe, expect, it } from 'vitest'
import { createTrainingPreset, defaultJobSpec, type JobRuntimeState } from '../../shared/training'
import { buildRuntimeTrainingReport } from './report-data'

describe('resolved report training settings', () => {
  it('uses the same expert merge rules as training and exports only known scalar settings', () => {
    const runtime: JobRuntimeState = {
      jobId: 'report', jobName: 'Amp', status: 'succeeded', pid: null, userMessages: [],
      frozenJob: { ...defaultJobSpec, id: 'report', name: 'Amp', createdAt: '', updatedAt: '' },
      frozenPreset: createTrainingPreset({ expert: {
        model: { optimizer: { lr: 0.02, weight_decay: 0.1 }, lr_scheduler: { kwargs: { gamma: 0.8 } },
          loss: { pre_emph_mrstft_weight: 0.2 }, privateNote: 'PRIVATE CONFIG' },
        learning: { train_dataloader: { batch_size: 32 } },
        data: { train: { ny: 4096 }, common: { x_path: 'C:/PRIVATE/audio.wav' },
          joint: [{ name: 'nam.data.normalize_joint_dataset_output', kwargs: { level_rms_dbfs: -20 } }] }
      } })
    }
    const report = buildRuntimeTrainingReport(runtime, { appVersion: 'test', modelPath: null })
    expect(report.settingsResolved).toBe(true)
    expect(report.settings).toEqual(expect.arrayContaining([
      { label: 'Batch size', value: '32' }, { label: 'Learning rate', value: '0.02' },
      { label: 'Exponential learning rate gamma', value: '0.8' }, { label: 'Samples per example', value: '4096' },
      { label: 'Weight decay', value: '0.1' }, { label: 'Pre-emphasized MRSTFT weight', value: '0.2' },
      { label: 'Output normalization (dB RMS)', value: '-20' }
    ]))
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|privateNote|x_path/)
  })
})
