# NAM-BOT guides

If this is your first time training locally, start with [Set up NAM-BOT](setup-guide.md). It explains the desktop download, the separate Python environment, and your first training job. The [project README](../README.md) gives a shorter introduction; [What's new](../WHATS_NEW.md) walks through the changes in 0.7.0.

## Train and manage models

| What you want to do | Guide |
| --- | --- |
| Install NAM-BOT, connect Conda, or set up CPU, NVIDIA, AMD, or Apple training | [Setup Guide](setup-guide.md) |
| Create a job or batch, manage the queue, and find exported models | [Jobs](jobs-system.md) |
| Choose a training mode, follow convergence, or save during training | [Jobs: training mode and convergence](jobs-system.md#training-mode-and-convergence) and [save and stop choices](jobs-system.md#export-during-training-and-stop-choices) |
| Choose a recipe, train larger packed models, or share your own preset | [Presets](presets-system.md) |
| Monitor active training and lifetime statistics | [Dashboard](dashboard.md) |
| Keep or share a PNG or interactive HTML training report | [Training reports](jobs-system.md#branded-training-reports) |
| Change the environment, default folders, author, preset, or notifications | [Settings](settings.md) |
| Diagnose a failed check, missing GPU, or blocked training launch | [Diagnostics](diagnostics.md) |
| Check the app version, find credits, or download an update | [About and updates](about.md) |
| Use application menus, keyboard shortcuts, zoom, and fullscreen | [Menus and keyboard](desktop-shell.md#menu-and-keyboard) |

## Work on NAM-BOT

| Topic | Reference |
| --- | --- |
| Install source dependencies, run the app, and validate a change | [Contributing](../CONTRIBUTING.md) |
| Menus, shortcuts, window behavior, and desktop verification | [Desktop shell](desktop-shell.md) |
| Mac builds, packaging, and platform checks | [macOS support](macos-support.md) |
| Shared typography, components, and visual checks | [UI style guide](ui-style-guide.md) |
| CI, preview builds, and tagged releases | [Release workflow](release-workflow.md) |
| Features covered by these guides and their implementation references | [0.7.0 documentation coverage](feature-coverage.md) |
| Report a security concern | [Security policy](../SECURITY.md) |

For a training problem, start with Diagnostics and review the information you plan to share. Its support exports can contain local paths and machine details. [Training reports](jobs-system.md#branded-training-reports) are designed for sharing results and contain a smaller set of model and training information.
