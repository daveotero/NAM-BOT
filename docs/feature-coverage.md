# 0.7.0 documentation coverage

This checklist maps the app's public features to user instructions and the source that defines their behavior. It covers the existing workflows as well as the 0.7.0 release themes described in [What's new](../WHATS_NEW.md). Use the [guide index](README.md) for everyday help.

The implementation references make this a maintenance checklist, not a claim that every hardware configuration or release artifact has been tested. The release workflow and its platform checks are documented separately.

## Setup and environment

| Feature | Documentation | Implementation |
| --- | --- | --- |
| Desktop installation; separate Conda training environment | [Setup](setup-guide.md) | [In-app Setup Guide](../src/renderer/features/help/Help.tsx) |
| Existing environment by name or prefix; Conda PATH or custom executable | [Settings](settings.md), [Setup](setup-guide.md#connect-an-existing-nam-environment) | [Settings](../src/renderer/features/settings/Settings.tsx) |
| CPU, NVIDIA CUDA, AMD ROCm, Apple Silicon MPS, Intel Mac limits | [Setup paths](setup-guide.md#create-a-new-environment) | [In-app Setup Guide](../src/renderer/features/help/Help.tsx) |
| NAM version compatibility and A2 requirements | [Diagnostics](diagnostics.md), [Setup](setup-guide.md) | [Diagnostics](../src/renderer/features/diagnostics/Diagnostics.tsx) |
| Package metadata checks and Lightning recovery advisory | [Setup recovery](setup-guide.md#lightning-security-block), [Diagnostics](diagnostics.md) | [Backend](../src/main/backend), [In-app Setup Guide](../src/renderer/features/help/Help.tsx) |
| Four readiness summaries, repair actions, check matrix, advanced details | [Diagnostics](diagnostics.md) | [Diagnostics](../src/renderer/features/diagnostics/Diagnostics.tsx) |
| Re-check, command copying, AI prompt and raw JSON exports; sharing privacy | [Diagnostics](diagnostics.md) | [Diagnostics](../src/renderer/features/diagnostics/Diagnostics.tsx) |

## Create jobs and manage training

| Feature | Documentation | Implementation |
| --- | --- | --- |
| Single-job editor, file picker, drag and drop, and batches | [Jobs](jobs-system.md) | [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Bundled V3 signal, Save Default to Disk, and custom input | [Jobs](jobs-system.md), [First model](setup-guide.md#train-your-first-model) | [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Preset choice, default preset, and selected packed submodels | [Jobs](jobs-system.md), [Presets](presets-system.md) | [Editor defaults](../src/renderer/features/jobs/jobEditorSession.ts), [Training types](../src/shared/training.ts) |
| Auto convergence levels and maximum; fixed epochs; manual override and Use Preset | [Training mode](jobs-system.md#training-mode-and-convergence), [Presets](presets-system.md) | [Training fields](../src/renderer/features/jobs/TrainingModeFields.tsx), [Convergence policy](../src/shared/convergence.ts) |
| Auto-align and manual latency; unsupported input handling | [Jobs](jobs-system.md) | [Queue manager](../src/main/jobs/queueManager.ts), [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Model output folder, Settings default, custom destination, workspace separation | [Jobs](jobs-system.md), [Settings](settings.md) | [Editor defaults](../src/renderer/features/jobs/jobEditorSession.ts), [Queue manager](../src/main/jobs/queueManager.ts) |
| Filename preview, preset and ESR suffixes, extra final-model copy | [Jobs](jobs-system.md) | [Filename builder](../src/shared/model-filename.ts), [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Model metadata, author, gear, tone, and calibration | [Jobs](jobs-system.md) | [Jobs](../src/renderer/features/jobs/Jobs.tsx), [Training types](../src/shared/training.ts) |
| Remembered job defaults and author precedence | [Jobs](jobs-system.md), [Settings](settings.md) | [Editor defaults](../src/renderer/features/jobs/jobEditorSession.ts) |
| Save, edit, duplicate, delete, search, draft ordering, and bulk actions | [Jobs](jobs-system.md) | [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Draft, waiting, and finished job templates; batch editing | [Jobs](jobs-system.md) | [Template drafts](../src/renderer/features/jobs/jobTemplateDrafts.ts), [Jobs](../src/renderer/features/jobs/Jobs.tsx) |
| Sequential queue, next-job order, frozen queued job and preset, Unqueue | [Jobs](jobs-system.md) | [Queue manager](../src/main/jobs/queueManager.ts) |
| Restart recovery, Resume Queue, diagnostics blocks, and old-process checks | [Jobs](jobs-system.md), [Diagnostics](diagnostics.md) | [Queue manager](../src/main/jobs/queueManager.ts) |
| Run states, progress, elapsed time, details, live logs, and log following | [Jobs](jobs-system.md), [Dashboard](dashboard.md) | [Runtime card](../src/renderer/features/jobs/RuntimeCard.tsx) |
| Save Snapshot and Save & stop; best checkpoints for each packed submodel | [Save and stop choices](jobs-system.md#export-during-training-and-stop-choices) | [Queue manager](../src/main/jobs/queueManager.ts), [Runtime card](../src/renderer/features/jobs/RuntimeCard.tsx) |
| Stop and discard, Force Stop, finalization, picker cancellation and export failures | [Save and stop choices](jobs-system.md#export-during-training-and-stop-choices), [Dashboard](dashboard.md) | [Jobs](../src/renderer/features/jobs/Jobs.tsx), [Dashboard](../src/renderer/features/dashboard/Dashboard.tsx) |
| Completed models, output links, failure details, and clearing history | [Jobs](jobs-system.md) | [Runtime card](../src/renderer/features/jobs/RuntimeCard.tsx) |

## Presets and packed models

| Feature | Documentation | Implementation |
| --- | --- | --- |
| A1 recipes and A2 Standard | [Presets](presets-system.md) | [Built-in recipes](../src/shared/training.ts) |
| Heavy 12 and Ultra 20; selected tiers, larger custom packs, quality tradeoffs | [Presets](presets-system.md), [What's new](../WHATS_NEW.md) | [Built-in recipes and normalization](../src/shared/training.ts) |
| Library sorting, details, creator links, new/duplicate/edit/delete | [Presets](presets-system.md) | [Preset library and editor](../src/renderer/features/presets/Presets.tsx) |
| Architecture, model family/size, batch size, sample window, learning rate/decay | [Presets](presets-system.md) | [Preset editor](../src/renderer/features/presets/Presets.tsx) |
| Loss, regularization, RMS level, stopping defaults, and Last used | [Presets](presets-system.md) | [Preset editor](../src/renderer/features/presets/Presets.tsx), [Training fields](../src/renderer/features/jobs/TrainingModeFields.tsx) |
| Data/model/learning JSON overrides, effective values, validation, and locked fields | [Presets](presets-system.md) | [Preset editor](../src/renderer/features/presets/Presets.tsx), [Config builder](../src/main/config) |
| Apply JSON versus preset file import/export; attribution and overwrite handling | [Preset sharing](presets-system.md#preset-file-import--export) | [Preset editor](../src/renderer/features/presets/Presets.tsx), [Preset storage](../src/main/persistence/presetStore.ts) |
| Compatibility with an installed NAM version and frozen queued recipes | [Presets](presets-system.md), [Jobs](jobs-system.md) | [Queue manager](../src/main/jobs/queueManager.ts) |

## Charts, reports, and training records

| Feature | Documentation | Implementation |
| --- | --- | --- |
| ESR history, submodel legends, logarithmic display, All/100/30 epoch windows | [Jobs](jobs-system.md) | [ESR chart](../src/renderer/features/jobs/EsrHistoryChart.tsx) |
| Hover, pinned inspection, keyboard navigation, Return to latest | [Jobs](jobs-system.md) | [ESR chart](../src/renderer/features/jobs/EsrHistoryChart.tsx) |
| History persistence and gaps; latest-chart versus saved-checkpoint ESR | [Jobs](jobs-system.md) | [History reader](../src/main/jobs/esr-history.ts), [Runtime card](../src/renderer/features/jobs/RuntimeCard.tsx), [Report data](../src/shared/training-report.ts) |
| Optional automatic PNG and HTML reports for model saves | [Reports](jobs-system.md#branded-training-reports) | [Report generation](../src/main/reports/training-report.ts), [Queue manager](../src/main/jobs/queueManager.ts) |
| Manual reports for finished, failed, or stopped runs; optional folder choice | [Reports](jobs-system.md#branded-training-reports) | [Report controls](../src/renderer/features/jobs/SaveReportButton.tsx) |
| Offline interactive HTML, branded PNG, model metadata, and privacy exclusions | [Reports](jobs-system.md#branded-training-reports) | [Report data](../src/shared/training-report.ts), [Report renderer](../src/renderer/report) |
| Saved-model ESR evidence, unavailable metrics, and nonfatal report errors | [Reports](jobs-system.md#branded-training-reports) | [Report generation](../src/main/reports/training-report.ts), [Queue manager](../src/main/jobs/queueManager.ts) |
| Dashboard counts, active run, and readiness tiles | [Dashboard](dashboard.md) | [Dashboard](../src/renderer/features/dashboard/Dashboard.tsx) |
| Lifetime totals, recent runs, local times, row dismissal, and statistics recovery | [Dashboard](dashboard.md) | [Training statistics](../src/renderer/features/dashboard/TrainingStatistics.tsx), [Statistics types](../src/shared/training-statistics.ts) |

## Desktop, preferences, and maintenance

| Feature | Documentation | Implementation |
| --- | --- | --- |
| Desktop workspaces, pinned actions, property-section navigation, and responsive layouts | [Desktop shell](desktop-shell.md), [Style guide](ui-style-guide.md) | [App shell](../src/renderer/App.tsx), [Shared components](../src/renderer/components) |
| Native window controls, application menu, shortcuts, zoom, and fullscreen | [Desktop shell](desktop-shell.md) | [Application menu](../src/main/shell/appMenu.ts), [Window chrome](../src/main/shell/windowChrome.ts) |
| Window state, unsaved-edit guards, active-training quit confirmation | [Desktop shell](desktop-shell.md) | [App shell](../src/renderer/App.tsx), [Window state](../src/main/shell/windowState.ts), [Quit guard](../src/main/shell/quitGuard.ts) |
| Sleep prevention during training and queue handoff; Windows display behavior | [Jobs](jobs-system.md) | [App lifecycle](../src/main/index.ts) |
| Persistent status bar and quick navigation | [Dashboard](dashboard.md), [Desktop shell](desktop-shell.md) | [Status bar](../src/renderer/components/AppStatusBar.tsx) |
| Open logs/workspace/presets folders and support links | [Desktop shell](desktop-shell.md), [Diagnostics](diagnostics.md) | [Application menu](../src/main/shell/appMenu.ts) |
| Autosave, author defaults, default preset, open-results preference, Windows notification toggle and macOS unavailability note | [Settings](settings.md) | [Settings](../src/renderer/features/settings/Settings.tsx), [Notifications](../src/main/shell/jobNotifications.ts) |
| Version, credits, stable update checks, downloads, and platform menu placement | [About](about.md) | [About](../src/renderer/features/about/About.tsx), [Application menu](../src/main/shell/appMenu.ts) |
| Source setup, validation, CI, Windows/Mac packaging, and release channels | [Contributing](../CONTRIBUTING.md), [macOS](macos-support.md), [Release workflow](release-workflow.md) | [Scripts](../package.json), [Workflows](../.github/workflows) |

## Release themes covered

The 0.7.0 themes all have both implementation references above and user-facing instructions: the desktop redesign, expanded packed presets, auto convergence, snapshot and save-and-stop exports, live chart inspection, and report sharing. The guides also retain first-use setup, ordinary queue management, metadata, preset exchange, diagnostics, and application preferences.

Keep this checklist current when a public feature changes. Update the owning guide and in-app help together, and describe release-specific changes in What's new rather than repeating the release history throughout the user guides.
