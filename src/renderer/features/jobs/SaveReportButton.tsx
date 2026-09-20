import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import type { TrainingReportFormat } from '../../../shared/training-report'
import ConfirmDialog from '../../components/ConfirmDialog'

interface SaveReportButtonProps {
  jobId: string
  onError: (message: string | null) => void
}

export default function SaveReportButton({ jobId, onError }: SaveReportButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  async function save(format: TrainingReportFormat): Promise<void> {
    setOpen(false)
    setSaving(true)
    onError(null)
    try {
      const result = await window.namBot.jobs.saveReport(jobId, format)
      if (result?.warnings.length) onError(result.warnings.join(' '))
    } catch (error) {
      onError(`Could not save report: ${error instanceof Error ? error.message : String(error)}`)
    } finally { setSaving(false) }
  }
  return <>
    <button type="button" data-no-card-toggle="true" className="btn btn-sm btn-secondary" disabled={saving} title="Export this run's training statistics and ESR history as a PNG image or an offline interactive HTML report." onClick={() => setOpen(true)}>
      {saving ? 'Saving Report...' : 'Save Report'}
    </button>
    {open && createPortal(<ConfirmDialog isOpen={open} title="Save training report" message="Choose a branded PNG image or a standalone interactive HTML report. You can choose where to save it next."
      confirmLabel="Save HTML" confirmClassName="btn btn-blue" alternateLabel="Save PNG"
      onConfirm={() => void save('html')} onAlternate={() => void save('png')} onCancel={() => setOpen(false)} />, document.body)}
  </>
}
