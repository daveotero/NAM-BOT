# Release workflow

NAM-BOT publishes Windows and macOS packages through GitHub Actions. A push to `main` produces a preview; publishing a stable version requires a release tag.

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [CI](../.github/workflows/ci.yml) | Every push and pull request | Type-check and test, then build and run the desktop suite on Windows and macOS. Upload test evidence, including on failure. |
| [Preview Releases](../.github/workflows/preview-release.yml) | A push to `main` | Type-check and test, then package both platforms and publish a GitHub prerelease for that run and commit. |
| [Release](../.github/workflows/release.yml) | A pushed `v*` tag or manual dispatch with an existing tag | Validate release metadata, type-check and test, then package both platforms and publish the tagged release. |

Release and preview packaging jobs do not run the desktop suite. Check the CI result and perform the relevant packaged-app smoke test before publishing a stable tag.

## Local release checks

From the repository root, run:

```bash
npm run check
npm run test:desktop-shell
npm audit
```

`npm run check` type-checks application and tests, runs the Vitest suite and Node release-metadata tests, then builds all three Electron targets. `npm run test:desktop-shell` exercises those compiled bundles in isolated Electron windows. `npm audit` checks the dependency tree for known npm advisories; it is separate from the application tests.

Use the [desktop verification guide](desktop-shell.md#development-and-verification) for packaged-app checks and platform-specific limits. Record which OS and architecture you tested. A Windows smoke test does not establish macOS behavior.

Before committing or publishing, inspect the working tree, staged changes, ignored generated files, local tags, and remote state. Keep test artifacts, private audio, and local training data out of the release commit.

## Stable and prerelease tags

The release workflow requires these values to agree:

- The Git tag, such as `v0.6.3`
- The `package.json` version, such as `0.6.3`
- A matching `CHANGELOG.md` heading, such as `## [0.6.3] - 2026-07-13`

These are examples. The release owner chooses the next patch, minor, major, or exact version. Keep `package-lock.json` consistent when changing `package.json`. An explicit increment authorizes calculating that version; committing, pushing, and publishing a release tag each still require the corresponding authorization in the working session.

The workflow stops before packaging if the tag, package version, or changelog section differs. Manual dispatch uses the `release_tag` input to check out an existing tag. GitHub Release creation also uses `--verify-tag`, so it cannot create a missing tag implicitly.

A version with a prerelease suffix, such as `0.6.4-rc.1`, produces a GitHub prerelease. A version without a suffix becomes the latest stable release. Release notes come from the matching changelog section; keep that section concise and useful to app users. When promoting a release candidate, consolidate its notes into the stable section unless retaining separate RC history is requested.

Push the finished release commit to `main`, inspect CI, and complete the final smoke test against that commit. Push the tag only after explicit confirmation to publish it. For example, after replacing the version with the approved value:

```bash
git tag v0.6.4
git push origin v0.6.4
```

The first command creates a local tag at the current commit. The second pushes only that tag and starts the public release workflow. Approval of a version bump or a `main` push alone does not authorize the tag push.

## Preview builds

Each preview uses a version such as `0.6.3-preview.184.ga1b2c3d` and a tag such as `preview-main-184-a1b2c3d`. The identifiers combine the base package version, workflow run number, and short commit hash.

A new workflow run gets a distinct preview identifier. Rerunning the same run reuses its identifier and updates its release assets. Previews are GitHub prereleases and do not replace the latest stable release. The workflow retains the ten most recent matching preview releases and removes older preview releases and their tags.

## Packaging commands

```bash
# Build and package the Windows installer.
npm run package:win

# Build and package both macOS architectures, then verify node-pty helpers.
npm run package:mac
```

`npm run package` performs the same Windows build as `npm run package:win`. Run macOS packaging on a Mac; see [macOS support](macos-support.md) for prerequisites and signing details.

The output directory is `release/`. The workflows publish:

| Platform | Asset |
| --- | --- |
| Windows x64 installer | `NAM-BOT-Setup-{version}-Win64.exe` |
| Windows x64 portable app | `NAM-BOT-Portable-{version}-Win64.zip` |
| Apple Silicon | `NAM-BOT-{version}-macOS-arm64.dmg` |
| Intel Mac | `NAM-BOT-{version}-macOS-x64.dmg` |

The Windows packaging command also leaves `release/win-unpacked/NAM-BOT.exe` for local testing. GitHub Actions creates the portable ZIP from that unpacked directory as a separate step; the local packaging script does not create the ZIP.

Both platform packaging jobs must succeed before the workflow publishes the release. Mac packages also pass the bundled `node-pty` helper check. CI release and preview builds disable Developer ID certificate discovery and have no notarization step.
