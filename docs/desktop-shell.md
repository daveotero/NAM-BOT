# Desktop Shell

NAM-BOT now uses a real Electron application shell instead of relying on the default Electron menu and a plain browser-style window.

## Menu Bar

- On Windows, the menu bar stays visible so app navigation and support actions are always easy to find.
- On macOS, the standard app menu stays visible and follows normal platform conventions.

The menu is organized around the screens that already exist inside the app:

- `File`: create a new Job or Preset, open the logs folder, open the workspace folder, and quit.
- `Navigate`: jump straight to Dashboard, Jobs, Presets, Diagnostics, Setup Guide, Settings, or Credits.
- `Edit`: standard native text-edit roles such as Undo, Redo, Cut, Copy, Paste, and Select All.
- `View`: zoom controls, fullscreen, and dev-only reload / devtools items while running in development.
- `Help`: a manual `Check for Updates` action, setup links, diagnostics, project links, and a conventional About dialog.

## Native Behaviors

- Active training updates the taskbar progress indicator so Windows shows that NAM-BOT is busy.
- Finishing, failing, or canceling a job triggers a desktop notification. Clicking the notification brings the app forward and opens Jobs.
- If training is still active, both window close and menu/keyboard quit share one confirmation. `Keep Training` leaves the process running. Shutdown cleanup runs only after quitting is approved.
- Launching NAM-BOT a second time focuses the existing instance rather than opening a competing queue against the same app data.
- `Help > About NAM-BOT` opens a conventional version dialog, while the in-app About route remains available as the Credits screen.
- The in-app About route also performs a background GitHub Releases check on app load and highlights the About nav item when a newer stable version is available.
- `Help > Check for Updates` forces a fresh release lookup immediately, bypassing the normal one-hour cache, and shows a result dialog so the user knows whether a new build exists.
- Failed update attempts report a failure and retain the last successful check date. A cached update link can remain available without claiming that the latest check succeeded.
- Confirmation dialogs provide keyboard focus containment, Escape cancellation, and focus restoration. Reduced-motion system preferences disable CSS animations and transitions.

## Support Folders

- Logs live under the app data folder in `logs/nam-bot.log`.
- Workspaces default to the configured workspace root from Settings. If no custom workspace root is set, NAM-BOT falls back to the app data `workspaces/` folder.

## Running And Packaging

- `npm run dev`: starts Electron in development mode with the renderer dev server and hot reload.
- `npm run build`: builds the main process, preload script, and renderer for production.
- `npm run preview`: launches the production build locally for a quick smoke test.
- `npm run package`: runs the production build and then creates the Windows installer package.
