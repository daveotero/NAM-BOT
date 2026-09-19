import type { JobSpec } from './training'

type ModelNamingJob = Pick<JobSpec, 'id' | 'name' | 'presetId' | 'appendPresetToModelFileName' | 'appendEsrToModelFileName'>

export function sanitizeFilenameStem(name: string, jobId: string): string {
  const sanitized = name.replace(/[<>:"/\\|?*]+/g, '-').replace(/[. ]+$/g, '').trim()
  return sanitized || `job-${jobId.slice(0, 8)}`
}

/** The editor uses 'pending' until training supplies the final ESR. */
export function buildModelFilename(job: ModelNamingJob, presetName?: string | null, esr?: number | 'pending' | null): string {
  const nameParts = [job.name.trim()]
  if (job.appendPresetToModelFileName && job.presetId && presetName?.trim()) nameParts.push(presetName.trim())
  const segments = [sanitizeFilenameStem(nameParts.join(' - '), job.id)]
  if (job.appendEsrToModelFileName && esr != null) {
    segments.push(esr === 'pending' ? 'ESR [pending]' : `ESR ${esr.toFixed(4)}`)
  }
  return `${sanitizeFilenameStem(segments.join(' - '), job.id)}.nam`
}
