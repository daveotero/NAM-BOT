export type AppRoute =
  | '/'
  | '/jobs'
  | '/presets'
  | '/settings'
  | '/diagnostics'
  | '/help'
  | '/about'

export interface NavigateAppCommand {
  type: 'navigate'
  path: AppRoute
}

export interface NewJobAppCommand {
  type: 'new-job'
}

export interface NewPresetAppCommand {
  type: 'new-preset'
}

export type AppCommand = NavigateAppCommand | NewJobAppCommand | NewPresetAppCommand

export interface ShellWindowState {
  focused: boolean
  fullscreen: boolean
  zoomFactor: number
}

/** Renderer CSS coordinates; the main process converts these to native DIPs. */
export interface AppMenuAnchor {
  x: number
  y: number
}
