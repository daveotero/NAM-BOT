import type { JSX } from 'react'

export type DiagnosticStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface DiagnosticSummary {
  title: string
  status: DiagnosticStatus
  label: string
  detail: string
  checkedAt: string | null
}

export function getDiagnosticStatusColor(status: DiagnosticStatus): string {
  switch (status) {
    case 'pass': return 'var(--neon-green)'
    case 'warn': return 'var(--neon-cyan)'
    case 'fail': return 'var(--neon-magenta)'
    case 'skip': return 'var(--text-steel)'
  }
}

export function getDiagnosticStatusLabel(status: DiagnosticStatus): string {
  switch (status) {
    case 'pass': return 'PASS'
    case 'warn': return 'CHECK'
    case 'fail': return 'FAIL'
    case 'skip': return 'SKIP'
  }
}

/** The dashboard and Diagnostics use the same reading hierarchy and status language. */
export default function DiagnosticSummaryCard({ summary }: { summary: DiagnosticSummary }): JSX.Element {
  return (
    <div className="diagnostic-summary-card">
      <div className="diagnostic-summary-heading">
        <span>{summary.title}</span>
        <span className="diagnostic-summary-status" style={{ color: getDiagnosticStatusColor(summary.status) }}>
          <span className="status-led" aria-hidden="true" />{getDiagnosticStatusLabel(summary.status)}
        </span>
      </div>
      <strong className="diagnostic-summary-label">{summary.label}</strong>
      <p className="diagnostic-summary-detail">{summary.detail}</p>
      {summary.checkedAt && (
        <small className="diagnostic-summary-time">Checked {new Date(summary.checkedAt).toLocaleTimeString()}</small>
      )}
    </div>
  )
}
