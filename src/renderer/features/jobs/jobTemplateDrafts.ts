import type { JobSpec } from '../../state/types'
import { filenameWithoutExt, getDirname } from './job-helpers'

export type DraftInput = Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>

interface BuildTemplateDraftOptions {
  template: JobSpec
  outputAudioPath: string
  outputFileName?: string
  batchId: string
  batchSourceName: string
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getOutputStem(outputAudioPath: string, outputFileName?: string): string {
  const stem = filenameWithoutExt(outputFileName || outputAudioPath).trim()
  return stem.length > 0 ? stem : 'New Job'
}

export function buildDraftFromTemplateForOutput(options: BuildTemplateDraftOptions): DraftInput {
  const template = cloneJson(options.template)
  const outputStem = getOutputStem(options.outputAudioPath, options.outputFileName)
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draftInput } = template
  const outputRootFollowsAudio = template.outputRootDirIsDefault

  return {
    ...draftInput,
    name: outputStem,
    batchId: options.batchId,
    batchSourceName: options.batchSourceName,
    outputAudioPath: options.outputAudioPath,
    outputRootDir: outputRootFollowsAudio ? getDirname(options.outputAudioPath) : template.outputRootDir,
    outputRootDirIsDefault: outputRootFollowsAudio,
    metadata: {
      ...template.metadata,
      name: outputStem
    },
    trainingOverrides: {
      ...template.trainingOverrides
    }
  }
}

export function buildDraftFromFrozenJob(frozenJob: JobSpec): DraftInput {
  const template = cloneJson(frozenJob)
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draftInput } = template

  return {
    ...draftInput,
    metadata: {
      ...template.metadata
    },
    trainingOverrides: {
      ...template.trainingOverrides
    }
  }
}
