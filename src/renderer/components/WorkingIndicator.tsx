import { useLayoutEffect, useState, type JSX } from 'react'

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const FADE_OUT_MS = 200

interface WorkingIndicatorProps {
  active?: boolean
}

/** Decorative activity signal; the surrounding control supplies its status text. */
export default function WorkingIndicator({ active = true }: WorkingIndicatorProps): JSX.Element | null {
  const [present, setPresent] = useState(active)
  const [scan, setScan] = useState(0)

  useLayoutEffect(() => {
    if (active) {
      setPresent(true)
      // Restart the LEDs before paint, including when work resumes mid-fade.
      setScan((previous: number): number => previous + 1)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPresent(false)
      return
    }
    const timeout = window.setTimeout(() => setPresent(false), FADE_OUT_MS)
    return () => window.clearTimeout(timeout)
  }, [active])

  if (!active && !present) return null

  return (
    <span className="working-indicator" data-active={active} aria-hidden="true" style={{ transitionDuration: `${FADE_OUT_MS}ms` }}>
      {CELLS.map((cell: number): JSX.Element => <span key={`${scan}-${cell}`} />)}
    </span>
  )
}
