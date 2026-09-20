# About Screen

UI presentation follows the shared [UI style guide](ui-style-guide.md), including typography, controls, and responsive review requirements.

The About screen doubles as NAM-BOT's in-app credits and lightweight update surface.

The MIT attribution and copyright retain the terminal's normal typography. The warranty paragraph is omitted from About; the full license remains included in packaged builds as `LICENSE.md`.

## Update Checks

- NAM-BOT performs a background update check each time the app loads.
- The app uses the project's GitHub Releases feed as the source of truth.
- Checks are throttled to at most once per hour across restarts by caching the last known result in the app data folder.
- Users can bypass that throttle manually through `Help > Check for Updates`, which forces a fresh lookup immediately.
- Failed attempts retain the last successful check timestamp and record a separate attempt time and error. The manual dialog reports the failure even if a previously discovered update remains available.
- Pre-releases are ignored, so only stable published releases count as updates.
- For local UI preview during development, you can spoof an available update by starting the app with `NAM_BOT_SPOOF_UPDATE_VERSION` set to a higher version than the packaged app.

## User Experience

- When NAM-BOT is already current, the About screen stays quiet and no extra update controls are shown.
- A manual menu-bar check always shows a native result dialog, even when no update is available.
- When a newer release exists, the About item in the left navigation shows a pulsing gold indicator.
- The About screen shows an animated CRT-style `Update available` marker next to the current version.
- Two actions appear when an update exists:
  - `Download latest` opens the newest GitHub release page in the default browser.
  - `View changelog` opens that release's notes page in the default browser.

## Terminal Diagnostics

- Opening About focuses its terminal immediately. Typing during the boot animation reveals the prompt and preserves the first character. Returning to the prompt restores terminal focus, and auto-scrolling leaves a blank line below it. Links, other controls, and application shortcuts keep their normal keyboard behavior.
- The BBS has a few unlisted extensions. Keep their names, entry sequences, controls, and outcomes out of public guides and release notes; an occasional nod to the after-hours switchboard is enough.
- Terminal sequences use the same CRT styling as the rest of About. Keep input forgiving, require a fresh keypress after transitions, and return cleanly to the prompt.
- Local activity pauses when focus is lost or the user leaves About. Timers and optional audio stop when the screen is closed, and reduced-motion preferences are respected.
- Keep terminal copy brief: useful feedback and a little personality, without redundant system labels or simulated status chatter.

## Verification

- Run `npm exec -- vitest run src/renderer/features/about/` for the About screen's local state, input, and persistence checks.
- Run `npm run build` followed by `npm run test:desktop-shell` for isolated Electron checks of keyboard focus, navigation, local persistence, and window layouts. Inspect the captured images as well as the test results.
- Run `npm run check` for all type checks, unit/integration tests, and the production build.

## Development And Packaging

- `npm run dev`: starts the Electron app in development mode with hot reload so you can verify the About screen and update badge live.
- `npm run build`: builds the main process, preload script, and renderer for a production-ready smoke test.
- `npm run preview`: launches the built app locally for a quick production-style check.
- `npm run package`: builds the app and then creates the Windows installer output used for releases.
