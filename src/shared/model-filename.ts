import type { JobSpec } from './training'

type ModelNamingJob = Pick<JobSpec, 'id' | 'name' | 'presetId' | 'appendPresetToModelFileName' | 'appendEsrToModelFileName'>

export function sanitizeFilenameStem(name: string, jobId: string): string {
  const sanitized = name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/[. ]+$/g, '').trim()
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

/** Snapshot defaults use the run's naming options and a local, second-resolution timestamp. */
export function buildSnapshotFilename(job: ModelNamingJob, date: Date, presetName?: string | null, esr?: number | null): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  const stem = buildModelFilename(job, presetName, esr).slice(0, -4)
  return `${stem} - Snapshot ${day} ${time}.nam`
}
