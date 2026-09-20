import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import type { TrainingReportFormat } from '../../../shared/training-report'
import ConfirmDialog from '../../components/ConfirmDialog'

export default function SaveReportButton({ jobId }: { jobId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  async function save(format: TrainingReportFormat): Promise<void> {
    setOpen(false)
    setSaving(true)
    setMessage(null)
    setFailed(false)
    try {
      const result = await window.namBot.jobs.saveReport(jobId, format)
      if (result) setMessage(result.warnings.length ? result.warnings.join(' ') : `${format.toUpperCase()} report saved.`)
    } catch (error) {
      setFailed(true)
      setMessage(`Could not save report: ${error instanceof Error ? error.message : String(error)}`)
    } finally { setSaving(false) }
  }
  return <div data-no-card-toggle="true">
    <button type="button" className="btn btn-sm btn-secondary" disabled={saving} onClick={() => setOpen(true)}>
      {saving ? 'Saving Report...' : 'Save Report'}
    </button>
    {message && <p className={failed ? 'operation-error' : 'ui-text-secondary'} role={failed ? 'alert' : 'status'}>{message}</p>}
    {open && createPortal(<ConfirmDialog isOpen={open} title="Save training report" message="Choose a branded PNG image or a standalone interactive HTML report. You can choose where to save it next."
      confirmLabel="Save HTML" confirmClassName="btn btn-blue" alternateLabel="Save PNG"
      onConfirm={() => void save('html')} onAlternate={() => void save('png')} onCancel={() => setOpen(false)} />, document.body)}
  </div>
}
