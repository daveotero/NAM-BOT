import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'

interface PropertySheetSection {
  id: string
  label: string
}

interface PropertySheetProps {
  sections: readonly PropertySheetSection[]
  navigationLabel: string
  className?: string
  children: ReactNode
}

/** Shared scrolling and section navigation for the desktop property editors. */
export default function PropertySheet({ sections, navigationLabel, className = '', children }: PropertySheetProps): JSX.Element {
  const [activeSection, setActiveSection] = useState(sections[0]?.id)
  const editorRef = useRef<HTMLDivElement>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const scrollTargetRef = useRef<string | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    const navigation = navigationRef.current
    if (!editor || !navigation) return
    scrollTargetRef.current = null
    editor.scrollTo({ top: 0, behavior: 'instant' })
    let frame: number | null = null
    const updateActiveSection = (): void => {
      frame = null
      if (scrollTargetRef.current) return
      const headingEdge = navigation.getBoundingClientRect().bottom + 16
      let currentSection = sections[0]?.id
      for (const section of sections) {
        const heading = editor.querySelector(`#${section.id}-heading`)
        if (heading && heading.getBoundingClientRect().top <= headingEdge) currentSection = section.id
      }
      if (editor.scrollTop > 0 && editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 2) {
        currentSection = sections[sections.length - 1]?.id
      }
      setActiveSection(currentSection)
    }
    const scheduleUpdate = (): void => {
      if (frame === null) frame = requestAnimationFrame(updateActiveSection)
    }
    const finishJump = (): void => {
      if (!scrollTargetRef.current) return
      // Keep the chosen section selected when a short final section cannot
      // reach the top. The next ordinary scroll resumes position tracking.
      scrollTargetRef.current = null
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
    }
    const interruptJump = (): void => {
      scrollTargetRef.current = null
      scheduleUpdate()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) interruptJump()
    }
    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(editor)
    observer.observe(navigation)
    const sheet = editor.querySelector('.editor-sheet')
    if (sheet) observer.observe(sheet)
    editor.addEventListener('scroll', scheduleUpdate, { passive: true })
    editor.addEventListener('scrollend', finishJump)
    editor.addEventListener('wheel', interruptJump, { passive: true })
    editor.addEventListener('touchstart', interruptJump, { passive: true })
    editor.addEventListener('keydown', handleKeyDown)
    scheduleUpdate()
    return () => {
      editor.removeEventListener('scroll', scheduleUpdate)
      editor.removeEventListener('scrollend', finishJump)
      editor.removeEventListener('wheel', interruptJump)
      editor.removeEventListener('touchstart', interruptJump)
      editor.removeEventListener('keydown', handleKeyDown)
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [sections])

  const jumpToSection = (sectionId: string): void => {
    const editor = editorRef.current
    const navigation = navigationRef.current
    const heading = editor?.querySelector<HTMLElement>(`#${sectionId}-heading`)
    if (!editor || !navigation || !heading) return
    const desiredTop = editor.scrollTop + heading.getBoundingClientRect().top - navigation.getBoundingClientRect().bottom - 12
    const top = Math.max(0, Math.min(desiredTop, editor.scrollHeight - editor.clientHeight))
    scrollTargetRef.current = Math.abs(top - editor.scrollTop) > 1 ? sectionId : null
    setActiveSection(sectionId)
    editor.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    heading.focus({ preventScroll: true })
  }

  return (
    <div ref={editorRef} className={`layout-main feature-workspace editor-workspace property-workspace ${className}`}>
      <nav ref={navigationRef} className="property-nav" aria-label={navigationLabel}>
        {sections.map(section => (
          <button key={section.id} type="button" aria-current={activeSection === section.id ? 'location' : undefined} onClick={() => jumpToSection(section.id)}>
            {section.label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  )
}

export function PropertySection({ id, title, children }: { id: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="property-section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} tabIndex={-1}>{title}</h2>
      {children}
    </section>
  )
}
