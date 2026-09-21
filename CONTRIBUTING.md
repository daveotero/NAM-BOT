# Contributing to NAM-BOT

NAM-BOT is an Electron desktop app for training Neural Amp Modeler captures. Contributions can cover the app, training integration, documentation, or testing on hardware the maintainer does not have.

Development is primarily on Windows. macOS support is already implemented, including Apple Silicon and Intel packaging, native menus, and desktop CI checks. Testing real training sessions and packaged builds on a Mac is especially useful. See the [macOS reference](./docs/macos-support.md) for platform details and credits.

## Before you start

Read the [README](./README.md) for the project overview and check existing issues and pull requests for related work. For a larger change, open an issue to discuss the problem before spending time on implementation.

Read [AGENTS.md](./AGENTS.md) when using an AI coding assistant. For UI changes, follow the [UI style guide](./docs/ui-style-guide.md), including its shared component and screenshot requirements.

## Set up a checkout

Use Node.js 22.12 or newer in the Node 22 series, with npm. CI uses Node 22. Clone your fork, then run these commands from the repository root:

```bash
npm ci
npm run dev
```

`npm ci` installs the versions recorded in `package-lock.json` and downloads the Electron runtime before tests or development start. `npm run dev` launches Electron with renderer hot reload. Restart the app after changing main-process or preload code, or use `npm run dev -- --watch` to watch those bundles too.

The app can launch without a configured training environment. To test real training, connect a Conda environment through Settings and follow the [setup guide](./docs/setup-guide.md). The [desktop test suite](./docs/desktop-shell.md#development-and-verification) uses isolated temporary data and simulated backend responses.

NAM-BOT uses React and TypeScript in the renderer, Zustand for shared renderer state, electron-log for logging, and electron-vite for builds. The main process under `src/main/` owns filesystem access, persistence, and training processes. `src/preload/` exposes the IPC bridge to `src/renderer/`.

## Check your changes

Run the combined check before opening a pull request:

```bash
npm run check
```

This type-checks application and test code, runs the Vitest application suite and Node release-metadata tests, then builds the main, preload, and renderer bundles. It does not run the desktop suite or package an installer.

You can run each part separately while working:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript across the application and tests. |
| `npm test` | Run Vitest and release-metadata tests once. |
| `npm run build` | Compile all three Electron targets into `out/`. |
| `npm run preview` | Launch the compiled app for manual review. |
| `npm run test:desktop-shell` | Exercise the compiled app in Electron through Playwright. Build first after source changes. |

For desktop behavior, run `npm run build` followed by `npm run test:desktop-shell`. The suite covers menus, window lifecycle, editor workflows, and rendered layout using a temporary profile. See [desktop verification](./docs/desktop-shell.md#development-and-verification) for packaged-app testing and the limits of native screenshots.

For UI changes, inspect rendered screenshots at normal width, at 1000×700, and at 150% application zoom. Check every consumer of a changed shared component. A passing layout assertion does not replace a visual review.

## Package the app

| Command | Output |
| --- | --- |
| `npm run package:win` | Build the app and create the Windows NSIS installer and `release/win-unpacked/` app. `npm run package` is an alias for this workflow. |
| `npm run package:mac` | Build the app, package Apple Silicon and Intel DMGs on macOS, and verify the bundled `node-pty` helper. |

Packaging writes to `release/`. Local packaging does not install the app. Follow the [release workflow](./docs/release-workflow.md) for artifact names, publication, and final checks.

## CI and releases

There are three GitHub Actions workflows:

- [CI](./.github/workflows/ci.yml) runs on pushes and pull requests. It type-checks and tests the project, then builds and runs the desktop suite on Windows and macOS.
- [Preview Releases](./.github/workflows/preview-release.yml) packages pushes to `main` as GitHub prereleases.
- [Release](./.github/workflows/release.yml) packages a pushed `v*` tag, or an existing tag selected manually. Stable versions become stable releases; versions with a prerelease suffix remain prereleases.

An ordinary branch push does not publish a stable release. Version selection and release-tag publication are separate decisions; the [release workflow](./docs/release-workflow.md) explains the required approval and metadata checks.

## Write a useful pull request

Keep the change focused and explain the problem it solves. Include how you tested it, the operating system and architecture, and any behavior you could not verify. For packaging or native-window changes, distinguish a successful build, an app launch, and a visual check on the target platform.

Update the relevant guide when changing a core workflow or screen. Use plain language in UI copy and user documentation; users should not need to understand Electron or Python internals to train a model.

Follow the existing code structure:

- Use explicit TypeScript parameter and return types, and avoid `any`.
- Keep main-process, preload, and renderer responsibilities separate.
- Catch asynchronous IPC failures and use `electron-log/main` for main-process logging.
- Reuse shared UI components and design tokens. Change the owning rule when a shared style needs updating.

## Report a bug

Include the app version, operating system and architecture, the steps you took, and what you expected to happen. For training or setup problems, include the Conda environment name or prefix, how Conda is located, and the selected CPU or GPU backend.

Relevant output from Diagnostics or `nam-bot.log` helps. Open logs through **File > Open Logs Folder**. Review diagnostics and logs for local paths or other personal details before posting them. Follow [SECURITY.md](./SECURITY.md) for security-sensitive reports.

Useful areas for contributions include testing packaged Mac builds and real training sessions, fixing platform-specific process or path issues, improving backend diagnostics, and making setup instructions easier to follow.
