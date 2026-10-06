# Desktop shell

This contributor reference covers the Electron window, menus, dialogs, and native verification. The [UI style guide](ui-style-guide.md) is the source of truth for typography, shared components, colors, and responsive layout.

## Window and workspace

The title bar shows the NAM-BOT wordmark and current section above the scrolling workspace. Blank header space can drag the window; the logo and menu button have separate interactive regions. The header dims when focus moves to another app. Reduced-motion preferences disable the wordmark animation.

The sidebar, page command strip, and bottom status bar are shared across screens. The status bar shows the backend, accelerator, current job, and queue state, with links to Diagnostics and Jobs. Active training takes precedence over a pending queue pause. Page actions belong to their feature components: Jobs, Presets, Settings, and Diagnostics render into `WorkspaceToolbar` through a React portal. The shell does not own their save, validation, or queue logic.

Navigation uses `AppCommand` and the unsaved-editor guard. See the [Jobs](jobs-system.md), [Presets](presets-system.md), [Settings](settings.md), and [Dashboard](dashboard.md) guides for user workflows.

## Platform behavior

| Platform | Window behavior |
| --- | --- |
| Windows | `titleBarStyle: hidden` with a 44-DIP native controls overlay. Minimize, maximize/restore, and close remain Windows controls. Blank header space supports native dragging, double-click, and snap behavior. |
| macOS | `titleBarStyle: hiddenInset` retains native traffic lights and the system application menu. Branding reserves 90 DIPs at the left; the app does not reposition the traffic lights. |
| Other platforms | The native frame and menu remain, with a compact header inside the window. |
| Fullscreen | The content header remains, including Windows menu access. Native-control reservations and header dragging are disabled until fullscreen ends. |

DIPs are device-independent pixels. The header compensates for application zoom so its native-control spacing and compact text stay usable. Windows supplies its overlay geometry through the `titlebar-area-x`, `titlebar-area-y`, `titlebar-area-width`, and `titlebar-area-height` CSS environment variables, with fallbacks for initialization. The native top resize border can add about one DIP to the reported height. The divider sits below the full overlay area so caption controls do not paint over it.

The shell IPC bridge reports focus, fullscreen state, and zoom. It accepts requests from the main window's main frame and does not expose custom minimize, maximize, or close commands.

### Windows application identity

Packaged installations retain the **NAM-BOT** name and `com.nambot.app` app ID, matching the NSIS shortcuts. Unpackaged runs (`npm run dev`, `npm run preview`, and desktop tests) use **NAM-BOT Dev** and `com.nambot.app.dev`, so Windows does not group development windows and pins with the installed app.

Before showing each main window, the app sets its taskbar relaunch name, command, and icon explicitly. Production relaunches the packaged executable; development relaunches Electron with the absolute project path, rather than opening Electron alone. Paths are quoted for spaces. Relaunch commands do not copy debug/test flags or environment variables. A development pin opens the compiled app from `npm run build`; it does not start the hot-reload server. Use `npm run dev` for hot reload.

This separates Windows shell identities, not data profiles. Existing settings, jobs, Chromium data, and isolated test paths stay in their original locations, and the existing single-instance guard remains. The in-app wordmark and page titles remain NAM-BOT.

Old pins and shortcuts can retain cached Electron branding. Unpin/remove the incorrect **Electron** entry, restart the updated app, and pin the appropriate **NAM-BOT** or **NAM-BOT Dev** entry. The app does not delete or rewrite existing user shortcuts.

## Menu and keyboard

On Windows, open the application menu with the upper-left button or F10. Enter and Space activate the focused button. The persistent Windows menu strip stays hidden; Alt does not reveal a second strip. Shift+F10 and Alt+Tab are not intercepted. macOS uses its normal application menu.

| Action | Shortcut |
| --- | --- |
| New Job | Ctrl/Cmd+N |
| New Preset | Ctrl/Cmd+Shift+N |
| Dashboard, Jobs, Presets, Diagnostics | Ctrl/Cmd+1, 2, 3, or 4 |
| Setup Guide | F1 |
| Settings | Ctrl/Cmd+, |
| Open Logs Folder | Ctrl/Cmd+Shift+L |
| Open Presets Folder | Ctrl/Cmd+Shift+P |
| Open Workspace Folder | Ctrl+Shift+W on Windows; Cmd+Shift+O on macOS |

Use Ctrl on Windows and Cmd on macOS. Settings lives under Navigate on Windows and the application-name menu on macOS. About NAM-BOT and Check for Updates are under Help on Windows and the application-name menu on macOS.

The menu definition in `src/main/shell/appMenu.ts` also supplies native editing commands, application zoom, fullscreen, folder access, and help links. Reload and developer tools appear in development. macOS retains Services, Hide, Paste and Match Style, the native Window menu role, and Help menu search. The Mac Window menu's Zoom action resizes the window; View controls application-content zoom.

Windows popup coordinates convert renderer CSS pixels to DIPs using the current zoom. Dismissing a popup returns focus to the previous control if it still exists; a newly opened confirmation dialog keeps focus.

Commands bring the window forward and recreate it when the last Mac window has closed. The latest pending command waits for saved settings and presets to load and for the renderer listener to become ready. This preserves defaults when New Job or New Preset opens an editor. Readiness messages require the main window's main frame. Single-instance activation also brings the existing app forward.

## Themed app dialogs

About, manual update-check results, and the training exit prompt use the shared app dialog. About includes version, credits, and project links; opening credits respects unsaved changes. The in-app About page remains available too.

The main process owns each dialog request and validates its window, request ID, and response index. A modal HTML dialog contains keyboard focus and makes the background inert. Escape selects the cancel action, and dismissal restores focus. On macOS the default button appears last on the right without changing response IDs; keyboard traversal follows the displayed order.

The app restores a minimized window before presenting a themed dialog. Navigation commands are ignored while a dialog is open. Reload or renderer loss cancels pending requests, and native message boxes are the fallback when the renderer is unavailable. File and folder pickers and fatal startup error boxes remain native.

## Notifications, updates, and shutdown

Training updates the taskbar progress indicator. On Windows, completed, failed, or canceled jobs can produce desktop notifications; clicking a notification brings the app forward and opens Jobs. Notifications are disabled in the unsigned macOS builds, with an explanation in Settings. The training-aware close and quit guard defaults to **Keep Training** and performs shutdown cleanup only after confirmation.

The startup GitHub Releases check marks About when a newer stable version is available. **Check for Updates** bypasses the one-hour cache and displays the result. Failed checks retain the last successful check date and cached release link without reporting a successful lookup. See [Updates and credits](about.md).

Open logs through **File > Open Logs Folder**. The file is `logs/nam-bot.log` under the application data directory. Workspaces use the root configured in Settings, with the application-data `workspaces/` directory as the fallback.

## Development and verification

From the repository root:

```powershell
npm ci
npm run dev
```

`npm ci` installs the locked dependencies. `npm run dev` starts Electron with renderer hot reload. Restart after main-process or preload changes, or use `npm run dev -- --watch` to watch those bundles. `npm run build` builds all three targets without launching; `npm run preview` opens that production build for manual review.

```powershell
npm run check
npm run test:desktop-shell
```

`npm run check` type-checks application and test code, runs Vitest and release-metadata tests, and builds the production bundles. The separate `npm run test:desktop-shell` command launches those bundles in Electron through Playwright. Rebuild before testing changed source. No separate Playwright browser download is needed.

### Automated coverage

The desktop suite checks application naming and profile preservation, preload initialization, renderer Node isolation, temporary persistence, native minimize/maximize/restore events, narrow and zoomed layouts, fullscreen, menus, popup anchoring, guarded editor navigation, training-aware close/quit cancellation, and second-instance activation. Windows tests read the actual window property store for taskbar identity, relaunch name/command/icon, and inspect OS hit regions for dragging, the menu, and caption controls.

Mac checks include Dock window recreation. Menu-command recreation verifies saved editor defaults on both platforms; the Windows test keeps only its isolated process alive after the last window closes to exercise this path. Other desktop cases cover feature workflows, shared styling, and report exports with simulated training data.

Native minimize, restore, maximize, and unmaximize listeners are registered before the action. Tests wait for native restoration and verify visibility, focus, and minimized state before maximizing. A renderer focus label alone does not establish restoration. Zoom checks wait for the renderer's shell scale to match the main process's zoom before accepting geometry or converting it to screen coordinates. Otherwise a complete frame from the previous zoom can produce incorrect native hit-test points.

Mac Quit uses `Menu.sendActionToFirstResponder('terminate:')`; calling a native role's JavaScript `click` callback does not perform its AppKit action. Mac tests check shortcut registration and custom callbacks separately because injected Chromium keys do not exercise AppKit shortcuts. Windows also exercises an injected native menu accelerator. The suite enables Chromium smooth scrolling to exercise that path regardless of host animation settings; reduced-motion cases check immediate navigation separately.

These checks do not cover physical keyboard and mouse behavior for every OS control, real GPU training, or every monitor configuration.

### Test isolation

The suite sets `NAM_BOT_DESKTOP_SHELL_SMOKE=1` and creates a dedicated `nam-bot-shell-*` directory directly under the system temporary directory. Its absolute path is passed through `NAM_BOT_DESKTOP_SHELL_DATA`. Bootstrap validates the location and sets `userData` and Chromium session data before importing persistence modules.

Smoke mode skips startup backend and update checks, supplies inert backend IPC fixtures, and disables training operations. `NAM_BOT_DESKTOP_SHELL_ACTIVE=1` can simulate active work for the real quit guard without starting a trainer. These switches belong to automated tests. The temporary profile is retained for diagnosis and cannot fall back to normal NAM-BOT data.

### Evidence and limits

The suite writes screenshots, available native captures, logs, and verification records under `test-results/desktop-shell/`. Its HTML report is in `playwright-report/`; both directories are ignored by Git. Windows and macOS CI build jobs upload this evidence even on failure.

Renderer screenshots capture app content. Native captures use Electron's host-window capture and can include OS controls. On macOS, native capture is marked unavailable unless screen-recording permission has already been granted, so unattended tests do not prompt for access.

Report these outcomes separately:

- A Mac build passed when compilation succeeded on a Mac runner.
- A Mac launch passed when the native Electron suite passed there.
- Mac native appearance was verified only when someone inspected a usable native capture or checked the app on a Mac. Renderer images and layout assertions alone do not establish it.

## Windows packaging and final checks

```powershell
npm run package:win
$env:NAM_BOT_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/NAM-BOT.exe').Path
try {
  npm run test:desktop-shell
} finally {
  Remove-Item Env:NAM_BOT_TEST_EXECUTABLE
}
```

`npm run package:win` builds the app and creates the NSIS installer plus the unpacked executable. The environment override runs the isolated suite against that packaged executable. The tests do not install the app or overwrite an existing installation. See [macOS support](macos-support.md) for Mac packaging.

Set `NAM_BOT_TEST_SCALE` to `1`, `1.25`, or `1.5` for forced Chromium device-scale checks, then remove it after the run. This differs from changing Windows display scaling or moving a window between physical monitors. Forced-scale runs check overlay geometry but skip the OS caption-edge hit test because Chromium's forced scale does not change Windows DPI.

Manual review should cover header dragging, double-click maximize/restore, caption buttons, Windows 11 snap layouts and maximize hover, Alt+Tab, and mixed-monitor scaling. Check Mac traffic-light alignment, fullscreen hover behavior, and menu appearance on a Mac or in usable native captures. Local Windows checks do not establish those results.
