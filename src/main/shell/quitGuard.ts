interface PreventableEvent {
  preventDefault: () => void
}

interface QuitGuardOptions {
  hasActiveWork: () => boolean
  confirmQuit: () => Promise<boolean>
  quit: () => void
  onError: (error: unknown) => void
}

/** Shared by app quit and window close. Cleanup belongs in will-quit, after approval. */
export function createQuitGuard(options: QuitGuardOptions): (event: PreventableEvent) => void {
  let approved = false
  let confirming = false
  return (event: PreventableEvent): void => {
    if (approved || !options.hasActiveWork()) return
    event.preventDefault()
    if (confirming) return
    confirming = true
    void options.confirmQuit().then((confirmed: boolean) => {
      if (confirmed) {
        approved = true
        options.quit()
      }
    }).catch(options.onError).finally(() => {
      confirming = false
    })
  }
}
