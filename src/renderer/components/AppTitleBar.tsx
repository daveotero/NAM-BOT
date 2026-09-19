import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import log from 'electron-log/renderer'

import type { ShellWindowState } from '../../shared/appShell'
import { getSectionLabel } from './title-bar-state'
import '../styles/title-bar.css'

interface TitleBarStyle extends CSSProperties {
  '--shell-scale': number
}

function AppTitleBar(): ReactElement {
  const { pathname } = useLocation()
  const section = getSectionLabel(pathname)
  const [windowState, setWindowState] = useState<ShellWindowState>({ focused: true, fullscreen: false, zoomFactor: 1 })
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuError, setMenuError] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const menuPending = useRef(false)
  const platform = window.namBot.platform

  useEffect(() => { document.title = `${section} — NAM-BOT` }, [section])

  useEffect(() => {
    let mounted = true
    let revision = 0
    const update = (state: ShellWindowState): void => {
      if (mounted) setWindowState(state)
    }
    const unsubscribe = window.namBot.shell.onWindowState((state) => { revision++; update(state) })
    const refresh = (): void => {
      const requestedRevision = ++revision
      void window.namBot.shell.getWindowState().then((state) => {
        if (requestedRevision === revision) update(state)
      }).catch((error: unknown) => log.error('Could not refresh window chrome:', error))
    }
    refresh()
    window.addEventListener('resize', refresh)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('resize', refresh)
    }
  }, [])

  const openMenu = useCallback(async (): Promise<void> => {
    const button = menuButton.current
    if (!button || menuPending.current) return
    const previousFocus = document.activeElement
    const rect = button.getBoundingClientRect()
    menuPending.current = true
    setMenuOpen(true)
    setMenuError(false)
    try {
      await window.namBot.shell.openMenu({ x: rect.left, y: rect.bottom })
    } catch (error) {
      log.error('Could not open the application menu:', error)
      setMenuError(true)
    } finally {
      menuPending.current = false
      setMenuOpen(false)
      requestAnimationFrame(() => {
        // Navigation commands may have opened an unsaved-changes dialog.
        if (document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')) return
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) previousFocus.focus()
        else button.focus()
      })
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.namBot.shell.onMenuRequested(() => { void openMenu() })
    // Also support Chromium-dispatched keyboard events (accessibility tools).
    // Physical F10 is consumed in the main process before it reaches the DOM.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (platform === 'win32' && event.key === 'F10' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        if (!event.repeat) void openMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { unsubscribe(); window.removeEventListener('keydown', onKeyDown) }
  }, [openMenu, platform])

  const style: TitleBarStyle = { '--shell-scale': 1 / windowState.zoomFactor }
  return (
    <header className="app-title-bar" data-platform={platform} data-focused={windowState.focused}
      data-fullscreen={windowState.fullscreen} style={style}>
      <div className="app-title-bar-safe-area">
        {platform === 'win32' && (
          <button ref={menuButton} type="button" className="app-title-bar-menu" aria-label="Application menu"
            aria-haspopup="menu" aria-expanded={menuOpen} aria-keyshortcuts="F10" title="Application menu (F10)"
            onClick={() => { void openMenu() }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
          </button>
        )}
        <span className="app-title-bar-brand">
          <span className="app-title-bar-wordmark">NAM-BOT</span>
        </span>
        <span className="app-title-bar-divider" aria-hidden="true">/</span>
        <span className="app-title-bar-section">{section}</span>
        {menuError && <span className="app-title-bar-error" role="alert">Menu unavailable. Try F10 again.</span>}
      </div>
    </header>
  )
}

export default memo(AppTitleBar)
