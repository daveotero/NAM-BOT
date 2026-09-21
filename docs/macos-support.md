# macOS support

NAM-BOT builds separate disk images for Apple Silicon (`arm64`) and Intel (`x64`) Macs. macOS support was contributed by Alex Nasla ([@alexnasla](https://linktr.ee/alexnasla), [Spectre Digital](https://spectredigital.com)).

This page covers platform behavior and packaging for contributors. For connecting a training environment, use the [setup guide](setup-guide.md).

## Install and open the app

Download the DMG for your Mac from [GitHub Releases](https://github.com/daveotero/nam-bot/releases/latest), open it, and copy NAM-BOT to Applications. The files are named `NAM-BOT-{version}-macOS-arm64.dmg` and `NAM-BOT-{version}-macOS-x64.dmg`.

CI builds are not Developer ID signed or notarized, so macOS may block the first launch. If you trust the download, Apple's documented exception process is to try opening the app, then go to **System Settings > Privacy & Security > Open Anyway** and confirm **Open**. See [Apple's current first-launch guidance](https://support.apple.com/en-us/102445) for the warning shown on your Mac.

The Mac application menu contains Settings, About NAM-BOT, and Check for Updates. The window keeps native traffic-light controls. Closing the last window leaves the application running; the Dock and application menu can open a new window. See the [desktop shell reference](desktop-shell.md) for menu shortcuts and lifecycle details.

## Build on a Mac

Use macOS, Node.js 22.12 or newer in the Node 22 series, npm, and Xcode Command Line Tools. If the command-line tools are missing, install them with:

```bash
xcode-select --install
```

From the repository root:

```bash
npm ci
npm run check
npm run test:desktop-shell
npm run package:mac
```

`npm ci` installs the locked dependencies. `npm run check` type-checks, runs the application and release-metadata tests, and builds the Electron bundles. `npm run test:desktop-shell` launches that build using isolated test data. `npm run package:mac` rebuilds, packages both DMGs into `release/`, and verifies the bundled `node-pty` helpers.

For development, `npm run dev` launches Electron with renderer hot reload. `npm run build` compiles without launching, and `npm run preview` opens the compiled app. The [contributor guide](../CONTRIBUTING.md) describes the shared workflow.

## Packaging configuration

[electron-builder.yml](../electron-builder.yml) defines both Mac architectures, the music application category, `build/icon.icns`, and `build/entitlements.mac.plist`. The project ships two architecture-specific DMGs; it has no universal target.

Training uses `node-pty` to launch the trainer and stream its terminal output. On macOS, that package needs an executable `spawn-helper`. Packaging unpacks `node_modules/node-pty/**/*` outside `app.asar`, then runs [build/after-pack.cjs](../build/after-pack.cjs). The hook finds the bundled helpers and restores executable permission with `chmod 755` when none of the execute bits are set.

[build/verify-macos-node-pty.cjs](../build/verify-macos-node-pty.cjs) also checks the packaged output. A missing helper or a helper that remains non-executable fails packaging verification. This catches one cause of `posix_spawnp failed`; it does not establish that every backend or training configuration launches successfully.

Conda defaults to `conda` on macOS. A custom Conda path or environment prefix is configured through Settings; see [Settings](settings.md).

## Signing and entitlements

The release and preview workflows set `CSC_IDENTITY_AUTO_DISCOVERY=false` and do not configure notarization. Enabling signed distribution requires a separate signing and notarization setup; see [Electron's signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing).

Electron 42 also requires code signing for macOS desktop notifications. NAM-BOT's macOS builds disable the notification checkbox and explain why alerts are unavailable. The app also suppresses notification delivery regardless of an older saved preference. See [Electron's notification change](https://www.electronjs.org/docs/latest/breaking-changes#behavior-changed-macos-notifications-now-use-unnotification-api); Jobs and Dashboard still show the run's status and results.

The checked-in inherited-entitlements file contains `allow-jit`, `allow-unsigned-executable-memory`, and `disable-library-validation`. Review those permissions before enabling signed distribution: the current [Electron notarization guidance](https://github.com/electron/notarize) advises against `allow-unsigned-executable-memory` for Electron 12 and later. This page describes the checked-in configuration; it does not certify it for a new signing workflow.

## Regenerate the Mac icon

The Mac icon is generated from `build/icon.png`. Run these commands on a Mac when replacing that source image:

```bash
mkdir -p /tmp/icon.iconset
sips -z 16 16     build/icon.png --out /tmp/icon.iconset/icon_16x16.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_16x16@2x.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_32x32.png
sips -z 64 64     build/icon.png --out /tmp/icon.iconset/icon_32x32@2x.png
sips -z 128 128   build/icon.png --out /tmp/icon.iconset/icon_128x128.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_128x128@2x.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_256x256.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_256x256@2x.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/icon.png --out /tmp/icon.iconset/icon_512x512@2x.png
iconutil -c icns /tmp/icon.iconset -o build/icon.icns
```

## Validation and publication

CI builds and launches the desktop suite on a macOS runner. Report that separately from testing a packaged DMG, completing a real training run, or inspecting native appearance on a particular Mac. The [desktop verification guide](desktop-shell.md#development-and-verification) explains capture permissions and test limitations.

Both tagged releases and `main` previews package the two Mac architectures alongside Windows assets. Preview entries remain prereleases. A tagged version with an RC or other prerelease suffix is also a prerelease; only a version without that suffix becomes the latest stable release. Follow the [release workflow](release-workflow.md) for metadata checks and publication approval.
