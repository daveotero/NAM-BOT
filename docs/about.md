# About and updates

Open **About** from the sidebar to see your NAM-BOT version, project links, credits, and available app updates. The screen includes links to the source repository, issue tracker, creator, studio, and project support.

The **What's New** line below your version opens the [release highlights](../WHATS_NEW.md) on GitHub, including when your app is already up to date.

NAM-BOT is a desktop front end for [Neural Amp Modeler](https://github.com/sdatkinson/neural-amp-modeler), created by Steven Atkinson. NAM-BOT is released under the [MIT license](../LICENSE.md).

## Check for an app update

Use the application menu for a fresh update check:

| Platform | Menu command |
| --- | --- |
| Windows | **Help → Check for Updates** |
| macOS | **NAM-BOT → Check for Updates** |

A result dialog appears in the app:

- **Update Available** shows the installed and latest versions. **Open Release Page** opens the download page in your browser.
- **No Updates Available** confirms that the check found no newer stable release.
- **Update Check Failed** explains the error and includes the last successful check time when one is available. Retry when the connection is working.

NAM-BOT checks GitHub's latest stable release. Preview releases are not offered by this check; you can find those on the [Releases page](https://github.com/daveotero/NAM-BOT/releases).

Opening a release page does not install an update automatically. Download the package for your platform and follow the [installation steps](setup-guide.md#install-the-desktop-app).

## Background checks and the About indicator

NAM-BOT checks for updates when it starts, reusing its cached result for up to an hour across restarts. The manual menu command always requests a fresh check.

When a newer stable release is available, an indicator appears beside **About** in the sidebar. The About screen marks your version with **UPDATE AVAILABLE** and adds **LATEST** and **CHANGELOG** links.

A failed check keeps the last known result. If a manual check fails, the error dialog reports that failure even when a previously discovered update is still shown.

## The About NAM-BOT menu item

**Help → About NAM-BOT** on Windows, or **NAM-BOT → About NAM-BOT** on macOS, opens a compact version and license dialog. **Credits Screen** opens the full About page; **Project Website** opens the repository in your browser.

App update checks do not update Python, PyTorch, or Neural Amp Modeler in your training environment. Use [Diagnostics](diagnostics.md) for the installed NAM version and [Setup](setup-guide.md) for environment updates.
