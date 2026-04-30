import { describe, expect, it } from 'vitest'

import { defaultJobSpec, type JobSpec } from '../../state/types'
import { buildDraftFromFrozenJob, buildDraftFromTemplateForOutput } from './jobTemplateDrafts'

function buildTemplate(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    ...defaultJobSpec,
    id: 'template-draft',
    name: 'Plexi Template',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    presetId: 'wavenet-feather',
    appendPresetToModelFileName: true,
    appendEsrToModelFileName: true,
    inputAudioPath: 'C:\\captures\\signals\\custom-input.wav',
    inputAudioIsDefault: false,
    outputAudioPath: 'C:\\captures\\template.wav',
    outputRootDir: 'C:\\captures',
    outputRootDirIsDefault: true,
    metadata: {
      name: 'Template Model',
      modeledBy: 'Dave',
      gearType: 'amp',
      gearMake: 'Marshall',
      gearModel: 'Plexi',
      toneType: 'crunch',
      inputLevelDbu: 4,
      outputLevelDbu: -10
    },
    trainingOverrides: {
      epochs: 60,
      latencySamples: 128
    },
    uiNotes: 'Session notes',
    ...overrides
  }
}

describe('buildDraftFromTemplateForOutput', () => {
  it('copies shared template fields and regenerates file-specific names', () => {
    const draft = buildDraftFromTemplateForOutput({
      template: buildTemplate(),
      outputAudioPath: 'D:\\batch\\bright-channel.wav',
      batchId: 'batch-1',
      batchSourceName: 'Plexi Template'
    })

    expect(draft).not.toHaveProperty('id')
    expect(draft.name).toBe('bright-channel')
    expect(draft.metadata.name).toBe('bright-channel')
    expect(draft.outputAudioPath).toBe('D:\\batch\\bright-channel.wav')
    expect(draft.outputRootDir).toBe('D:/batch')
    expect(draft.outputRootDirIsDefault).toBe(true)
    expect(draft.presetId).toBe('wavenet-feather')
    expect(draft.inputAudioPath).toBe('C:\\captures\\signals\\custom-input.wav')
    expect(draft.metadata.modeledBy).toBe('Dave')
    expect(draft.metadata.gearMake).toBe('Marshall')
    expect(draft.metadata.inputLevelDbu).toBe(4)
    expect(draft.trainingOverrides.latencySamples).toBe(128)
    expect(draft.batchId).toBe('batch-1')
    expect(draft.batchSourceName).toBe('Plexi Template')
  })

  it('preserves custom output roots from the template', () => {
    const draft = buildDraftFromTemplateForOutput({
      template: buildTemplate({
        outputRootDir: 'E:\\nam-models',
        outputRootDirIsDefault: false
      }),
      outputAudioPath: 'D:\\batch\\normal-channel.wav',
      batchId: 'batch-2',
      batchSourceName: 'Plexi Template'
    })

    expect(draft.outputRootDir).toBe('E:\\nam-models')
    expect(draft.outputRootDirIsDefault).toBe(false)
  })

  it('uses the browser filename when the full file path is not available', () => {
    const draft = buildDraftFromTemplateForOutput({
      template: buildTemplate(),
      outputAudioPath: 'edge-of-breakup.wav',
      outputFileName: 'edge-of-breakup.wav',
      batchId: 'batch-3',
      batchSourceName: 'Plexi Template'
    })

    expect(draft.name).toBe('edge-of-breakup')
    expect(draft.metadata.name).toBe('edge-of-breakup')
  })
})

describe('buildDraftFromFrozenJob', () => {
  it('drops frozen runtime identity while preserving editable job fields', () => {
    const draft = buildDraftFromFrozenJob(buildTemplate({
      id: 'finished-job-id',
      batchId: 'batch-1',
      batchSourceName: 'Plexi Template'
    }))

    expect(draft).not.toHaveProperty('id')
    expect(draft.name).toBe('Plexi Template')
    expect(draft.outputAudioPath).toBe('C:\\captures\\template.wav')
    expect(draft.presetId).toBe('wavenet-feather')
    expect(draft.batchId).toBe('batch-1')
    expect(draft.batchSourceName).toBe('Plexi Template')
    expect(draft.metadata.gearModel).toBe('Plexi')
    expect(draft.trainingOverrides.epochs).toBe(60)
  })
})
