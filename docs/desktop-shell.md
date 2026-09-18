# Desktop shell

NAM-BOT uses one compact retro header for the wordmark, current section, and training activity. The sidebar and feature screens retain their existing layout. The header stays above scrolling content, uses the existing pixel font, and becomes subtly muted when the window loses focus. Activity is Idle, Training (including preparation and stopping), Finalizing, or Queue Paused. Active work takes precedence over a pending queue pause. The wordmark restores the original cyan/magenta split shadow and wild color-flash/shake on hover, scaled to the compact header. Reduced-motion preferences disable the animation. The logo has a stable hover area; drag the blank header space to move the window.

## Platform behavior

- **Windows:** `titleBarStyle: hidden` and a 44-DIP native window-controls overlay replace the standard title strip. Minimize, maximize/restore, and close remain Electron/Windows controls. The thin native resize border can add about one DIP to the renderer's reported overlay height. Blank header space is draggable; the menu button is not. Double-click and snap behavior remain with Windows.
- **macOS:** `titleBarStyle: hiddenInset` retains the standard inset traffic lights and the normal application menu. Their position is not customized. Branding reserves 90 DIPs at the left edge. This reservation and the compact header's typography compensate for application zoom.
- **Other platforms:** retain their native window frame and menu, with a compact content header.
- **Fullscreen:** the header remains useful for section/activity and Windows menu access, but removes the native-control reservations and drag behavior. Exiting fullscreen restores the platform's spacing.

Windows uses Electron's `titlebar-area-x`, `titlebar-area-width`, and `titlebar-area-height` CSS environment variables, with conservative initial fallbacks. The shell bridge reports focus, fullscreen, and application zoom; it does not implement minimize/maximize/close commands.

## Menu and keyboard

On Windows, click the upper-left menu button or press **F10**. Enter and Space activate the focused button. The popup uses the same menu definition as the application menu on macOS. The persistent Windows menu strip is hidden without enabling Alt-to-reveal. Shift+F10 and combinations such as Alt+Tab are not intercepted.

Existing shortcuts remain registered, including Ctrl/Cmd+N for New Job, Ctrl/Cmd+Shift+N for New Preset, Ctrl/Cmd+1–4 for the main sections, F1 for Setup Guide, and Ctrl/Cmd+, for Settings. Popup coordinates are converted from renderer CSS pixels to window DIPs at the current zoom. Dismissing the menu restores focus to the previous control when it still exists; a newly opened confirmation dialog keeps its focus.

New Job, New Preset, and navigation still use `AppCommand` and the existing unsaved-editor guard. Native close and application quit still pass through the training-aware quit guard. Single-instance activation and macOS Dock window recreation are preserved.

The shared menu groups commands under File, Navigate, Edit, View, Window, and Help. File includes logs, workspace, and preset folders. Edit retains standard native text editing; View includes application zoom and fullscreen, with reload/devtools available in development. Help includes setup, diagnostics, project links, update checking, and About.

## Existing native integrations

Active training updates the taskbar progress indicator. Finished, failed, or canceled jobs produce desktop notifications; clicking one brings the app forward and opens Jobs. The training quit confirmation defaults to **Keep Training**, and shutdown cleanup runs only after approval. Confirmation dialogs retain focus containment, Escape cancellation, and focus restoration.

Help > About NAM-BOT opens the version dialog, while the in-app About screen remains available. The startup GitHub Releases check highlights About when a newer stable version is available. Help > Check for Updates bypasses the one-hour cache and shows the result. A failed lookup retains the last successful check date and any cached release link without reporting success.

Logs live in the application data folder at `logs/nam-bot.log`. Workspaces use the root configured in Settings, falling back to the app data `workspaces/` directory.

## Development and verification

From this checkout:

```powershell
npm ci
npm run dev
```

`npm ci` installs the locked dependencies. `npm run dev` starts Electron with hot reload for main/preload/renderer development.

`npm run build` builds all three targets without launching. `npm run preview` opens the compiled production build for an ordinary manual smoke test.

```powershell
npm run check
npm run test:desktop-shell
```

`npm run check` type-checks application and tests, runs Vitest and release-metadata tests, and builds the production main/preload/renderer bundles. `npm run test:desktop-shell` launches those compiled bundles in real Electron windows through Playwright; run the build first after changes. No separate Playwright browser download is needed.

Desktop tests cover preload initialization and renderer Node isolation, isolated persistence, native window minimize/maximize/restore, 1000×700 resizing, 75–150% application zoom, fullscreen transitions, menu activation and zoomed popup anchoring, guarded navigation for all three editor types, canceled training-aware close/quit, and second-instance activation. Shell requests from another window are rejected. Windows also checks actual OS hit regions for dragging, the menu, and all three caption controls. A macOS-only test recreates the window through the Dock activation path. Native menu actions and canceled dialogs are driven through Electron; this is not a claim of physical keyboard/mouse testing for every OS control.

Tests set `NAM_BOT_DESKTOP_SHELL_SMOKE=1` and require a dedicated `nam-bot-shell-*` directory directly under the system temporary folder via `NAM_BOT_DESKTOP_SHELL_DATA`. Bootstrap sets `userData` and Chromium session data **before persistence modules initialize**. Startup backend/update checks are skipped, backend IPC uses inert fixtures, and training operations are disabled. An optional `NAM_BOT_DESKTOP_SHELL_ACTIVE=1` simulates active work for the real quit guard without starting a trainer. These switches are for automated tests only. Temporary data is retained for failure diagnosis and is never the normal NAM-BOT profile.

The suite writes renderer images, native window captures where available, logs, and `verification.json` under `test-results/desktop-shell`; the HTML report is in `playwright-report`. Both locations are ignored by Git. Windows and macOS build jobs run the suite and upload its evidence even on failure. Native captures use Electron's host window capture, not the renderer screenshot. On macOS, capture is marked unavailable unless screen-recording permission is already granted, avoiding an unattended permission prompt.

Report the following separately:

1. **Mac build verified:** compilation succeeded on a Mac runner.
2. **Mac launch verified:** the native Electron suite passed on that runner.
3. **Mac native appearance verified:** a usable native capture was inspected, or someone checked the app on a Mac. A renderer screenshot or passing layout assertion alone does not establish this.

## Windows packaging and final checks

```powershell
npm run package:win
$env:NAM_BOT_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/NAM-BOT.exe').Path
npm run test:desktop-shell
Remove-Item Env:NAM_BOT_TEST_EXECUTABLE
```

`npm run package:win` builds the application and creates the Windows NSIS installer plus the unpacked packaged executable. The environment override runs the same isolated tests against that executable. The tests do not install the app or overwrite an existing installation.

For reproducible Chromium device-scale checks, set `NAM_BOT_TEST_SCALE` to `1`, `1.25`, or `1.5` before running the suite, then remove it. Forced device scale is distinct from changing Windows display settings or moving between physical monitors.

Human checks still matter: drag the blank header, double-click to maximize/restore, test the caption buttons, Windows 11 snap layouts/maximize hover, Alt+Tab, and mixed-monitor display scaling. macOS traffic-light alignment, fullscreen hover behavior, and the normal menu must be checked on a Mac or in usable native CI captures. Local Windows tests do not establish those Mac results.
