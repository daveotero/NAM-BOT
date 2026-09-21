# What's new in NAM-BOT

Feature walkthroughs for significant NAM-BOT releases. For installation and everyday use, start with the [README](README.md). The [changelog](CHANGELOG.md) records individual releases and fixes.

## 0.7.0

This overview brings together the changes since **0.6.0**, including the intervening 0.6.x updates. Screenshots show example sessions using recorded training curves.

NAM-BOT has a redesigned desktop workspace, larger packed-model presets, and more control over when to save a model or finish training. Live charts help you follow each submodel, and shareable reports keep the results with the capture.

### A redesigned desktop application

The interface has been reorganized around compact workspaces. Jobs, Presets, Settings, Diagnostics, and Setup Guide share section navigation and consistent controls. Save and other main actions stay at the top while you scroll through an editor. A persistent status bar keeps environment and training status visible.

The compact title bar retains the operating system's window controls. On Windows, application commands are available from the menu button or **F10**. On macOS, Settings, About, and update checks use the standard application menu, alongside native Help and Window menus. Menus and keyboard shortcuts respect unsaved edits, and closing the app asks before stopping active training.

The retro appearance remains, with more consistent typography, clearer field borders, themed dialogs, and layouts that adapt to narrower windows and higher zoom. Section scrolling and animated indicators respect reduced-motion preferences.

![NAM-BOT's redesigned Dashboard and desktop workspace](docs/screenshots/dashboard.png)

### Larger packed models and more room to experiment

The standard A2 pack's Lite and Full models are now joined by **Heavy 12** and **Ultra 20** presets. They train additional, wider submodels in the same run and export them together in a packed `.nam` file.

| Preset | Submodels trained together |
| --- | --- |
| A2 Standard | Lite (3 channels), Full (8) |
| A2 Heavy 12 | Lite (3), Full (8), Heavy (12) |
| A2 Ultra 20 | Lite (3), Full (8), Heavy (12), Ultra (16), Mammoth (20) |

These larger networks give you more capacity to pursue higher-quality captures, while the smaller tiers provide lighter playback options. More capacity also costs training time, memory, and playback processing power. Compare each tier's ESR and listen to the results to decide whether the extra work benefits your capture.

In a job using a pack with three or more submodels, the **Packed models** checklist lets you select the tiers to train. You can try a smaller subset without changing the library preset. Custom compatible packs also appear in the preset details and per-job checklist, including tiers beyond the bundled sizes.

Choose **Customize** on a built-in preset to make your own recipe. The preset editor includes training and stopping defaults, loss settings, and advanced JSON overrides. See the [Presets guide](docs/presets-system.md) for editing and sharing recipes.

### Auto convergence: finish when progress settles

**Auto convergence** watches recent validation ESR improvements and finishes training when every exported submodel meets the selected stopping threshold. ESR is the error-to-signal ratio; lower values mean less measured error against the reference recording.

| Threshold | When to choose it                                                                         |
| --------- | ----------------------------------------------------------------------------------------- |
| Fast      | You want an earlier result and are willing to leave smaller improvements for another run. |
| Balanced  | You want a longer observation window and a tighter improvement threshold than Fast.       |
| Obsessive | You want to give very small improvements more time to settle.                             |

Every automatic run has a **Maximum epochs** limit. The bundled A2 presets start at 2,000: standard and Heavy 12 use Balanced, while Ultra 20 uses Obsessive. The progress bar shows how much of that limit has been used; convergence can finish the run sooner.

The single **Convergence** value in expanded run details shows history collection, recent ESR improvement against the selected threshold, or confirmation progress. Hover it for the observation window and previously reached levels. **Fixed epochs** remains available with the same feedback while continuing to your chosen epoch count. A recorded plateau describes recent progress; further improvement may still be possible.

Presets can supply their own stopping policy or use **Last used**. Each job can override it, and **Use preset** restores the preset's choices. Pick the mode, threshold, and limit before queueing: active runs keep those settings fixed. Automatic completion saves the best validated model and advances the queue.

See [training mode and convergence](docs/jobs-system.md#training-mode-and-convergence) for the stopping rules and default-setting behavior.

### Save the best model while training continues—or finish early

Once a validated checkpoint is available, the **Jobs** card gives you control over the next model save:

| Action                | Result                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Save Snapshot         | Choose a `.nam` destination, export the best validated weights so far, and continue training.     |
| Stop → Save & stop    | Export the best validated weights, then finish the run cleanly.                                   |
| Stop → Discard & stop | End training without requesting another export. Existing snapshots, checkpoints, and logs remain. |
| Stop → Keep training  | Close the dialog and let the run continue.                                                        |

For a packed model, each exported submodel uses its own best validated checkpoint. Those checkpoints can come from different epochs. This lets you save the best ESRs reached across the pack even if the latest measurements have moved upward.

Snapshot filenames respect the run's preset-name and ESR options and include a local timestamp. The name and destination remain editable. Canceling the save dialog, or an export failure, leaves training running. Saving is unavailable before the first validated checkpoint and while another export is pending.

You can save an intermediate model, listen to it, and keep the experiment going. See [exports and stop choices](docs/jobs-system.md#export-during-training-and-stop-choices) for details.

### See how every submodel is learning

Expanded job details now include a live **ESR over time** chart, with a separate color for each submodel. The logarithmic scale makes changes at low ESR values easier to inspect, and the labels use ordinary decimals.

- Choose **All**, **100 epochs**, or **30 epochs** to see the whole run or follow recent progress.
- Hover to inspect an epoch, or click/tap to pin it. **Return to latest** resumes following the newest result.
- Click a model in the legend to show or hide its curve. Keyboard controls also support epoch inspection.

The curves show each epoch's validation result. Saved-model ESR describes the selected best checkpoints, so it can differ from the newest graph point. Recorded history stays with finished runs across app restarts; older runs without history show that it is unavailable.

![Training progress, packed-model ESR curves, and snapshot controls in Jobs](docs/screenshots/jobs.png)

### Share the results as well as the recipe

Training reports give you a record you can send with a model:

- **PNG** produces a NAM-BOT summary image with training facts, saved-model ESR, and the graph.
- **HTML** adds interactive chart controls and more run details. It works offline as a single file, with its fonts, styles, and scripts included.

Enable either or both under **Model output → Training reports**. Reports accompany normal completion, **Save Snapshot**, and **Save & stop**. The selections become defaults for new jobs. You can also use **Save Report** on a finished Jobs card.

Snapshot reports retain the measurements and history captured with that export, even if training continues. Reports without a saved model label available checkpoint values as **Best recorded ESR**; missing measurements remain unavailable. Reports leave out full local paths, terminal logs, and private job notes. A report-generation error is shown separately and does not undo a successfully saved model.

Preset import/export also carries the new stopping settings. A shared recipe can now include its convergence threshold and maximum epochs alongside the training configuration and creator attribution.

<details>
<summary>Example PNG training report</summary>

<img src="docs/screenshots/training-report.png" alt="A NAM-BOT training report showing saved-model ESR and the recorded training curves" />

</details>

Read more about [training reports](docs/jobs-system.md#branded-training-reports) and [preset sharing](docs/presets-system.md#preset-file-import--export).

### Other improvements you'll notice

- **Automatic latency alignment.** Jobs can measure the recording delay before training when using a recognized NAM training signal. Manual delay remains available in samples; zero explicitly means no correction. The run details and log show the alignment used.
- **A batch editor.** Adding several output recordings opens one editor for shared settings before creating the drafts. Waiting jobs now offer **Create Batch**, and drafts can be reordered by dragging.
- **Search and preferred defaults.** Jobs search covers names, presets, and audio paths. Settings lets you choose the default preset for new jobs and dropped audio. The job editor previews the model filename as you change output options.
- **A longer view of your training.** Dashboard shows lifetime completed runs, training time, epochs, and the most-used preset. Clearing Jobs history keeps these totals. You can dismiss recent Dashboard rows individually or clear that list without deleting the runs from Jobs.
- **Logs that stay where you put them.** Live output follows automatically until you scroll up to read an earlier section. Returning to the bottom resumes following. Log handling is also more responsive during long, busy runs.
- **A notification toggle on Windows.** Settings now includes an on/off switch for desktop training alerts. Clicking an alert brings you back to Jobs or Diagnostics. The switch is disabled on macOS, with a note explaining that notifications are unavailable in unsigned applications.
- **Easier access to saved files.** Run details link to model files, output folders, logs, and workspaces. An optional final-model copy can place the `.nam` beside the captured output audio.

### More reliable long-running sessions

Queued runs retain a copy of their recipe and attribution, so later preset edits or deletion do not change a waiting run. After a restart, **Resume Queue** lets you continue pending jobs. Jobs waiting for NAM-version confirmation point to Diagnostics instead of immediately failing.

Draft and preset storage now uses recoverable backups, with recovery for interrupted queue transfers and batch saves. Failed or stopped jobs offer **Create Draft** for an editable retry. A run is marked successful only after its new model has been finalized; old files in the workspace cannot stand in for a missing export.

Long batches keep the sleep-prevention request active between jobs. If a forced stop cannot confirm that the previous trainer has ended, the queue pauses for you to check before another run starts. macOS packaging also verifies the helper used to launch training, addressing cases where the Python environment passed validation but the training process could not start.

### Moving from 0.6.0

- A2 still requires NAM 0.13.0 or newer. Run **Diagnostics → Re-check All** after changing the app's training environment.
- Existing drafts, templates, and queued runs keep their own stopping settings. Creating a new job with a bundled A2 preset uses its new auto-convergence defaults.
- Charts collect history for new runs; they do not reconstruct missing measurements from older jobs. Snapshot controls need a run started with the updated training support and an available validated checkpoint.
- Older Direct Python configurations migrate to Conda defaults. Check **Settings** if you previously used that configuration; supported environments are selected by Conda name or folder path. The [Setup Guide](docs/setup-guide.md) covers both.

Some frequencies remain absent from the station log. The switchboard has been listening after hours.
