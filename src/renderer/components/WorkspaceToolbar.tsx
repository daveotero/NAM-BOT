import { createContext, useContext, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const WorkspaceToolbarContext = createContext<HTMLDivElement | null>(null)

interface WorkspaceToolbarProps {
  title: string
  titleControls?: ReactNode
  children: ReactNode
}

/** Keep each screen's real action handlers in its component, inside the fixed shell toolbar. */
export default function WorkspaceToolbar({ title, titleControls, children }: WorkspaceToolbarProps): JSX.Element | null {
  const host = useContext(WorkspaceToolbarContext)
  if (!host) return null

  return createPortal(
    <>
      <div className="workspace-heading-group">
        <div className="workspace-title">
          <span className="workspace-prompt" aria-hidden="true">&gt;</span>
          <h1>{title}</h1>
        </div>
        {titleControls}
      </div>
      <div className="workspace-toolbar-actions">{children}</div>
    </>, host
  )
}
