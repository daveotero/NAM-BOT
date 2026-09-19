import { useState, type JSX } from 'react'

interface CopyableCodeBlockProps {
  label: string
  command: string
}

export default function CopyableCodeBlock({ label, command }: CopyableCodeBlockProps): JSX.Element {
  const [copyError, setCopyError] = useState(false)
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <div className="reference-code-block">
      <div className="reference-code-header">
        <span>{label}</span>
        <button type="button" className="btn btn-sm btn-secondary" aria-label={`Copy ${label}`} onClick={() => void handleCopy()}>Copy</button>
      </div>
      <pre className="reference-code">{command}</pre>
      {copyError && <p role="alert" className="operation-error">Could not copy to the clipboard.</p>}
    </div>
  )
}
