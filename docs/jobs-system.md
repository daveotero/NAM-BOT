# Jobs

A job pairs a training signal with the recording of that signal through your gear. You choose a [preset](presets-system.md), decide when training should stop, and tell NAM-BOT where to save the model.

Use the [Setup guide](setup-guide.md) to connect your NAM environment first. This guide covers creating jobs, running batches, reading results, and recovering work after an interruption.

## Train a capture

1. Open **Jobs** and select **New Job**.
2. Give the job a name. This also becomes the beginning of the exported `.nam` filename.
3. Under **Input Audio**, choose the original signal you played through the gear. Use **Default** only when the capture was recorded with the bundled `v3_0_0.wav` signal. **Output Audio** is your recorded, re-amped signal.
4. Choose a preset and review **Training**. The initial default is A2 Standard with Balanced auto convergence and a 2,000-epoch limit.
5. Review **Model output**. Choose an output folder, filename options, and any reports you want saved with the model. Add model metadata if you want it embedded in the `.nam` file.
6. Select **Save Job**. The job appears in Drafts. Select its **Queue** button when you are ready to train.
7. When training succeeds, select **Open Folder** on the finished card to find the model. **Show Details** gives you ESR results, the training history, and links to individual files.

Queueing can start training immediately when the queue is idle and ready. Save a draft when you want to review the setup first.

## Drafts, queue, training, and finished runs

The strip below the Jobs toolbar counts each section. Select a section to scroll to it.

| Section | What you can do |
| --- | --- |
| Drafts | Edit, Queue, Copy, Create Batch, or Delete saved jobs. |
| Queue | Reorder waiting jobs, return them to Drafts with Unqueue, or use one as a batch template. |
| Training | Read progress, expand details or logs, save a snapshot, or stop the active run. |
| Finished | Open successful results, inspect logs and metrics, save a report, create a draft, use a run as a template, or clear its history entry. |

Jobs run one at a time. The **lowest visible queued job runs next**. Drafts follow the same order: **Queue All** submits them from bottom to top. Drag drafts or waiting queue entries to change their order. Preparing or active runs cannot be reordered.

**Queue All** skips drafts missing a name, audio paths, or output folder and reports how many it skipped. It checks the selected drafts' training requirements before adding them, so an incompatible A2 preset does not leave half a batch queued. **Unqueue All** returns waiting jobs to editable drafts.

**Search jobs** matches job and model names, batch labels, preset names, and audio paths. Search ignores case and surrounding spaces. Counts show the matching entries, while queue position numbers keep their original meaning. Clear search to re-enable drag ordering, Queue All, Unqueue All, and Clear Finished; individual job actions remain available. Creating, copying, or saving jobs clears search so the new drafts are visible.

### What queueing freezes

Queueing saves a complete copy of the job and its preset, including expert JSON, naming options, reports, metadata, and stopping rules. Later edits or deletion of the library preset cannot change that queued run, its displayed preset name, or its exports. The original draft leaves Drafts after the queued copy is saved.

An editable draft still references a library preset. **Unqueue**, **Create Draft**, and runtime templates restore the saved job choices and preset ID; they do not restore the old preset into the library. If that preset has changed, the next queue operation uses its current recipe. If it is missing, choose a replacement explicitly. Duplicate a preset before experimenting when you want both recipes available.

Backend settings are captured when preparation starts. Changes to [Settings](settings.md) during preparation or training apply to later runs.

## Audio and latency

You can type or paste audio paths, or use **Browse**. NAM-BOT accepts WAV, MP3, FLAC, AIFF, and AIF files in its pickers and drag-and-drop workflow; decoding depends on your NAM environment.

**Default** input uses the bundled NAM V3 signal. **Save Default to Disk** exports a copy for making captures. **Custom** lets you select another original training signal. A custom file can still be a recognized NAM signal, such as V2, but the custom data split differs from the bundled V3 split. See [custom input splits](#custom-input-splits) before using a signal with its own validation layout.

The first new job uses **Auto-align**. NAM-BOT asks NAM's standard-input analyzer to measure the delay before training. This works with recognized signals containing the expected timing marks, including NAM V2 and V3. If the analyzer cannot determine a delay, the job fails during preparation with an explanation.

For an unrecognized or custom signal, select **Manual** and enter the known delay in samples. A value of `0` applies no latency correction. After a run starts, Show Details displays the latency mode and actual delay used. Logs include the alignment result and any warnings.

If the preset fixes `data.common.delay` through an expert override, the latency controls are locked and auto-alignment is skipped. Edit or customize the preset to change that value.

## Training mode and convergence

An epoch is one pass through the training material. Validation ESR, or error-to-signal ratio, measures how closely the model matches the held-out recording; lower values mean a closer numerical fit.

| Mode | When the run finishes |
| --- | --- |
| Auto convergence | Every exported model meets the chosen convergence threshold, or the required Maximum epochs limit is reached. |
| Fixed epochs | Training reaches the chosen epoch count. Convergence is still monitored, but does not stop the run. |

Choose **Fast** for an earlier stop with more potential improvement left, **Balanced** for a longer observation period, or **Obsessive** to wait for smaller gains over a longer period. These settings judge recent ESR improvement. They do not guarantee a particular sound or that further training could never help.

### Convergence thresholds

Detector version 1 uses full-precision validation ESR and the same fixed rules on every installation:

| Level | Minimum validated epochs | Observation window | Improvement must be below | Earliest possible stop* |
| --- | ---: | ---: | ---: | ---: |
| Fast | 100 | 50 observations | 2% | Epoch 104 |
| Balanced | 150 | 75 observations | 1% | Epoch 154 |
| Obsessive | 300 | 150 observations | 0.25% | Epoch 304 |

For **every exported model**, the detector compares its best-so-far ESR at the start and end of the window. It also compares median ESR in the older and newer halves of that window. Both relative improvements must be *strictly below* the selected percentage. An ESR increase counts as no improvement because the final export uses the best validated checkpoints. In a packed model, every selected tier must meet the rule.

All models must pass for **five consecutive valid observations**. The first qualifying observation counts as 1/5; a gain at or above the threshold resets the count. For example, Obsessive waits until at least 300 validated epochs, checks the most recent 150 observations, then needs five consecutive passes. The 0.25% threshold is a relative ESR improvement over that window, not a change between just two adjacent epochs.

**Elapsed minutes are not part of the rule.** The detector normally gets one final validation observation per completed epoch, excluding sanity checks and duplicates. If validation happens less often, collecting the window takes more training epochs and more clock time. An epoch without validation adds no observation; an invalid or incomplete observation clears the window, which must then refill. The per-job Maximum epochs limit is a separate safety stop; the default is 2,000. A usable checkpoint and any trainer minimum-epoch or minimum-step settings must also be satisfied before an automatic convergence stop.

*The earliest stops assume valid validation every epoch, qualifying ESR at the first eligible check, and no other trainer constraint delaying the stop. These are theoretical minimums, not expected stop epochs. The detector does not change the optimizer or learning-rate schedule, and its initial replay coverage does not establish universal stopping times across captures or model architectures.*

Auto convergence requires a positive **Maximum epochs** value. This replaces the preset's fixed epoch target for that run. The progress bar shows how much of the safety limit has been used, so a run can finish successfully before it reaches 100%. Invalid or empty edits restore the last valid limit when you leave the field.

The **Convergence** value shows where convergence monitoring stands: gathering validation history, recent ESR improvement against the selected threshold, or confirmation progress such as `Below threshold · confirming 3/5`. The percentage is the largest relative best-ESR improvement or median trend across all exported models in the observation window. It is not a percent-complete estimate and can rise when training finds new gains. Hover the value for the window, stopping criteria, and previously reached levels. Older runs without numeric monitoring data show a text status. An automatic stop reports the actual completed epoch, such as `Auto-stopped at epoch 413 · Fast · model saved`.

The mode, threshold, and limit are fixed once the job is queued. Automatic completion uses the normal model export, metadata, naming, report, and queue-advance process. Monitoring errors remain visible and never count as convergence; the configured limit and manual stop controls still apply.

### Which defaults win

1. A new job uses **Settings > Application > Default preset**. If that selection is unavailable, NAM-BOT tries A2 Standard, then the last-used visible preset, then the first visible preset.
2. An explicit stopping policy in that preset supplies the mode, threshold, and limit. A preset set to **Last used** uses your remembered job choices. With no remembered choice, the fallback is Balanced auto convergence with 2,000 maximum epochs.
3. Changing the job's mode, threshold, limit, or fixed epoch count creates a job override. Switching presets keeps that override. **Use preset** restores the selected preset's stopping defaults and fixed epoch count.

Choosing a preset alone does not change your remembered stopping preferences. Explicit mode, threshold, and limit changes do; the maximum is remembered even after switching to fixed mode. Fixed epoch counts come from the preset or the particular job. Saved drafts and templates keep their resolved stopping rules when a library preset is edited.

Expert `trainer.max_epochs` overrides lock the fixed epoch field. In auto mode, the job's Maximum epochs remains the effective safety limit. Older uncapped auto-convergence recipes receive a 2,000-epoch limit when prepared for a new run; historical records keep the original policy.

### Choose packed model tiers

A Packed WaveNet model contains several submodels in one export. For presets with three or more tiers, **Packed models** lists the tiers available to this job. All start selected, and at least one must remain selected.

For example, Ultra 20 includes Lite, Full, Heavy, Ultra, and Mammoth. You can train a subset without making another preset. Changing presets resets the checklist to the new preset's full set. Auto convergence checks every selected model. See the [preset comparison](presets-system.md#choose-a-preset) for bundled and larger custom packs.

## Output folders, filenames, and metadata

### Choose a model destination

| Output folder option | Destination |
| --- | --- |
| Settings Default | The Default Model Output Root configured in Settings. This option is unavailable when that setting is empty. |
| Output audio folder | The folder containing this job's captured output audio. For a batch, each capture uses its own folder. |
| Custom Folder | A separate folder chosen for this job. The last saved custom folder can be reused. |

Without a remembered folder preference, a new job uses Settings Default if configured, otherwise the output audio folder. NAM normally creates a timestamped run folder within the chosen output root. The model stays in that subfolder alongside checkpoints, training logs, and selected reports.

For example, with **Output audio folder** selected and **Extra copy** enabled:

```text
Capture folder/
  Capture.wav
  Capture.nam                 <- extra copy directly beside the WAV
  Capture.training.html       <- companion report, if enabled
  <timestamped run folder>/
    Capture.nam               <- original model
    Capture.training.html     <- companion report, if enabled
    ... checkpoints and training logs ...
```

Without Extra copy, the model and reports remain in the run subfolder. This is why the two options are useful together, even when the selected output root is the WAV's folder.

The **workspace** is separate. NAM-BOT puts generated configs, control files, and the workspace terminal log under the Workspace Root from Settings, or its application-data fallback. Changing the model output folder does not move the workspace. In Show Details, **Output folder** and **Workspace** open the respective locations; **File > Open Workspace Folder** opens the workspace root.

### Name the exported model

The filename begins with the job name. **Append preset name** and **Append final ESR** add optional suffixes in that order:

```text
Job Name.nam
Job Name - Preset Name.nam
Job Name - Preset Name - ESR 0.0123.nam
```

The preview applies filename sanitization and updates as you edit. It shows `ESR [pending]` until a result exists. Batch previews use each capture's name, not the shared batch label.

**Copy finished model and reports beside output WAV** adds a copy of the final model directly beside the capture, while keeping the normal model in the run's output subfolder. Selected reports accompany the copy; checkpoints and logs stay in the subfolder. If the extra-copy destination already contains that filename, NAM-BOT adds a numeric suffix. This option applies to final completion; a manually saved snapshot uses the destination you choose in its save dialog.

### Add model metadata

**Model Name** is the name embedded inside the `.nam` file and is independent of the filename. **Use Output Filename** beside Job Name or Model Name copies the capture's filename without its extension into that field.

Metadata also includes Modeled By, gear make/model/type, tone type, and send/return levels in dBu. NAM-BOT adds the training date, validated ESR, and run attribution when exporting. A packed model records individual submodel ESR values as well as the primary ESR.

## Branded training reports

Under **Model output > Training reports**, enable either or both of:

- **Save training image (PNG)** for a shareable statistics card and ESR graph.
- **Save interactive report (HTML)** for a single offline file with the graph, training recipe summary, metadata, timestamps, and checkpoint details.

Both options start off and remember your last choices. Copies, templates, batches, and queued runs preserve the job's report settings.

Selected reports accompany normal completion, **Save Snapshot**, and **Save & stop**. A final model's extra copy beside the capture also gets companion reports. Reports use the saved model's filename stem with `.training.png` or `.training.html`; automatic exports add a numeric suffix when a companion file already exists. A report failure shows a warning while leaving the saved model usable.

**Saved model ESR** describes the checkpoints actually exported. It can differ from the last measured ESR on the graph, and the best checkpoint for each packed submodel may come from a different epoch. Snapshot statistics are captured when the snapshot is exported, so later training does not rewrite them.

The PNG is 1,000 pixels wide with height determined by its contents. HTML embeds its fonts, styles, scripts, and recorded data and works offline. Its chart supports the same inspection controls as the app. Dates use the viewer's local timezone. Reports record the starting stopping policy, convergence attainment, and finish reason where available. They omit terminal logs, local folder paths, private job notes, and raw config JSON; model identity and metadata remain part of the report.

Finished Jobs cards also have **Save Report**. Choose PNG or HTML and a destination; this does not change future job defaults. Failed, stopped, and older runs can report whatever evidence remains. If a saved snapshot is available, its captured evidence can be used. Otherwise checkpoint values are labeled **Best recorded ESR**, and missing measurements remain unavailable. Saved report links appear in the card's Artifacts section. Dashboard does not offer this manual export action.

## Watch training

Collapsed cards show progress, the primary ESR, elapsed time, and state-specific information. NAM-BOT does not display a remaining-time estimate. **Show Details** opens training facts, the ESR comparison, history, and available artifacts.

For packed models, the largest exported tier supplies the headline ESR, filename ESR suffix, and primary training metadata when packed metrics are available. The comparison lists each tier separately. The aggregate sum of packed ESR values is not used as the headline.

### Read the ESR chart

The chart shows measured validation results, including temporary regressions. The summary of best checkpoints answers a different question: which measurements were best so far.

- **All**, **100 epochs**, and **30 epochs** change the visible window. Recent windows follow training; the full history is retained.
- Hover to inspect an epoch. Click or tap to pin it, and select **Return to latest** to follow new results again.
- With the chart focused, use arrow keys for adjacent recorded epochs, Home for the first visible epoch, and End or Escape to return to latest.
- Select a model in the legend to hide or show its curve.

The vertical scale is logarithmic with decimal ESR labels. A true zero appears at the bottom with its exact value and an explanatory note. Early runs leave room for future epochs instead of stretching a single point across the plot. Empty space is not a measurement.

Results appear after validation, normally once per epoch. If validation runs several times in one epoch, the last observation represents that epoch; epochs without validation have no point. History survives with finished, failed, and stopped runs. A new training attempt starts a new history, and older runs without recorded history show an empty state.

### Follow logs and open artifacts

**Show Logs** follows new terminal output, including the final lines after a run ends. Scroll up to pause following; return to the bottom to resume. **Auto-scroll paused** describes the log view, not a paused trainer. Hiding and reopening logs retains the scroll position while the card stays mounted. The pane also supports keyboard scrolling.

Artifacts include the workspace, output folder, terminal/run logs, model, latest exported snapshot, and reports when available. Folder links open the folder. File links reveal the file in its folder; hover to see its full path.

Finished cards show completion time in your local timezone; hover for the start time. A run only succeeds after NAM-BOT finds the final model and finishes result processing. **Completed with warnings** means a model was produced but an operation such as metadata, naming, copying, or reporting needs attention. Check the card and logs for the specific warning.

## Export during training and stop choices

In **Jobs**, **Save Snapshot** becomes available after the first validated checkpoint in a run started with live-export support. Choose a `.nam` destination. NAM-BOT exports the best validated checkpoint for each embedded model, briefly waiting at a safe training boundary, then continues training. **Latest exported snapshot** opens the most recent result.

The suggested filename follows the run's frozen preset-name and ESR options and ends with a local timestamp, for example:

```text
My Amp - Studio - ESR 0.0123 - Snapshot 2026-09-19 14-32-08.nam
```

The ESR is the best reported checkpoint value when the dialog opens, rounded to four decimal places. Training can advance while you choose the destination. You can edit the name, and the dialog asks before replacing an existing file. Save & stop uses the same naming rules.

**Stop** on a Jobs card opens these choices:

| Choice | Result |
| --- | --- |
| Save & stop | Exports the best validated model to your chosen destination, then requests a clean finish and normal final export. A successful run reports Finished early · model saved. Canceling the picker or an export failure leaves training running. |
| Discard & stop | Ends training immediately without requesting a new export. Existing snapshots, checkpoints, logs, and history remain. |
| Keep training | Closes the dialog and continues the run. |

Save Snapshot and Save & stop are unavailable before a checkpoint is exportable or while another export is pending. Expert `min_epochs` or `min_steps` settings can delay a clean finish. Use **Force Stop** if a waiting stop cannot finish; see [recovery](#recover-and-repeat-work) if termination is not confirmed.

These snapshot and three-choice controls belong to Jobs. Dashboard's Stop requests cancellation directly; open Jobs when you want to choose whether to save first.

## Create batches and reuse a setup

**Add audio files** and drag-and-drop use the same workflow. One capture creates a saved draft and immediately opens **Edit Job** for review. **Save Job** saves your changes; closing the editor leaves the original draft available. Queue it from Drafts when ready. Multiple captures open the batch editor so you can review shared choices before creating drafts. Fresh imports use your selected default preset and remembered input, output-folder, naming, report, and capture preferences. Model output explanations are available by hovering the labels and options.

To reuse a particular setup, choose **Create Batch** on a draft or waiting job, or **Use as Template** on a finished run. Select the new captures, review the shared fields, and select **Create Batch**. Each result is an independent editable draft; nothing starts training yet.

The batch preserves the template's preset selection, training and stopping settings, packed-tier choices, input signal, filename/report options, metadata, and notes. Each draft gets its own output audio path and a job name from that filename. If the output folder follows the capture, it follows each new file's folder. Otherwise all drafts keep the shared destination.

Leave the batch's shared Model Name blank to use each filename as its embedded model name. Enter a shared Model Name if every export should carry the same value. The **Batch Label** identifies the group; it does not replace the individual job names. The source and generated jobs show a batch badge, but editing one never changes the others. Batch creation is saved as a single recoverable operation to avoid partial or duplicate batches after an interrupted response.

### Remembered choices and unsaved edits

New jobs reuse the last saved input mode/custom path, latency mode, manual delay, Modeled By, and send/return levels. A remembered Modeled By takes precedence over Default Author Name in Settings. Broader gear and tone metadata only carries across through an explicit copy or template.

Output-folder mode and the custom folder are remembered when you save. Filename, extra-copy, and report checkboxes remember their choices. The [stopping defaults](#which-defaults-win) have their own precedence; selecting a different preset is not the same as changing your default preset in Settings.

The editor's section buttons scroll between **Name & audio**, **Training**, **Model output**, and **Metadata** without hiding other fields. Save and Cancel remain at the top. Save Job is enabled when required fields are complete and there is work to save. An unavailable preset must be replaced explicitly.

Cancel and navigation prompts protect changed fields and selected batch files. Automatic resolution of a default path does not count as an edit. Picker or save failures retain your edits for retry. An unsaved editor exists only in memory, so save a draft before closing the app. Draft deletion can be confirmed individually or use the remembered **Don't show this again** choice.

## Recover and repeat work

A2 jobs require NAM `0.13.0` or later. A confirmed older version blocks enqueue with upgrade guidance. If the selected environment's NAM version has not been confirmed, the job can wait in Queue with **Diagnostics needed**. Open [Diagnostics](diagnostics.md) and run **Re-check All**. Confirming a compatible version resumes a diagnostics-blocked queue during the same uninterrupted session.

After restarting NAM-BOT, waiting jobs remain paused until you select **Resume Queue**. A run that was active at the interruption is marked failed because its training process is no longer attached. Review its logs and any remaining process before starting another attempt.

If Force Stop cannot confirm termination, the run becomes failed and the queue stays paused. Check Task Manager or Activity Monitor and confirm the previous trainer has stopped before resuming. Adding jobs or running Diagnostics does not bypass this pause.

Use **Create Draft** on a finished, failed, or stopped run to review its settings and train again. This creates a new attempt; it does not resume a checkpoint. The preset-library caveat under [what queueing freezes](#what-queueing-freezes) applies.

| Work | What remains after closing or clearing |
| --- | --- |
| Unsaved editor | Lost when the app closes unless saved as a draft. |
| Saved drafts | Stored for the next session and kept editable. |
| Waiting jobs | Stored with frozen recipes; require Resume Queue after restart. |
| Finished history | Stored with available metrics, logs, and artifact links until cleared. |
| Exported models, reports, checkpoints, and logs | Kept on disk when you Clear a history entry or Clear Finished. |
| Lifetime training statistics | Kept when history is cleared; see [Dashboard](dashboard.md). |

Drafts and queue files retain backup copies. Transfers between Drafts and Queue save a recoverable copy before removing the source. Preset recovery notices appear in Jobs and Presets if a backup was needed or a recipe could not be read.

While the queue is working, NAM-BOT asks the operating system to prevent sleep. On Windows this also keeps the display awake; on other platforms the display can sleep. The sleep blocker is released when training and queue handoff finish or the app exits.

## Technical reference

### Custom input splits

The generated V3 configuration holds out the last nine seconds for validation. Custom input holds out the last ten seconds and sets `data.common.require_input_pre_silence` to `null`, which allows continuous custom signals without the official pre-validation silence. Both permit unequal audio lengths. Preset Data JSON can override the split when the signal has a known layout.

For a V2-style custom input, use this split when it matches your capture layout:

```json
{
  "train": {
    "stop_seconds": -20.0
  },
  "validation": {
    "start_seconds": -20.0,
    "stop_seconds": -11.0
  }
}
```

ESR from a custom holdout describes that particular material. It is not directly comparable with V3 ESR unless the validation material is equivalent.

### Source and data formats

The maintained TypeScript types are the complete schema reference. Use them instead of a copied JSON example when writing tools around NAM-BOT's files.

| Topic | Source |
| --- | --- |
| `JobSpec`, `JobRuntimeState`, report flags, packed selections, and metadata | [Shared training types](../src/shared/training.ts) |
| Editor defaults, stopping precedence, and batch copies | [Job editor session](../src/renderer/features/jobs/jobEditorSession.ts), [stopping preferences](../src/renderer/features/jobs/training-mode-preferences.ts), [template drafts](../src/renderer/features/jobs/jobTemplateDrafts.ts) |
| Jobs actions, runtime cards, logs, and chart controls | [Jobs screen](../src/renderer/features/jobs/Jobs.tsx), [runtime card](../src/renderer/features/jobs/RuntimeCard.tsx), [ESR chart](../src/renderer/features/jobs/EsrHistoryChart.tsx) |
| Data/model/learning config generation and expert precedence | [Config builder](../src/main/config/configBuilder.ts) |
| Draft persistence and recoverable queue transfers | [Jobs IPC](../src/main/ipc/jobs.ts) |
| Runtime states, process cancellation, output discovery, and finalization | [Queue manager](../src/main/jobs/queueManager.ts), [run directory resolver](../src/main/jobs/runDirectoryResolver.ts) |
| Validation history and live export wrapper | [Training metrics script](../src/main/backend/training-metrics-script.ts), [history reader](../src/main/jobs/esr-history.ts), [training controls](../src/main/jobs/training-control.ts) |
| Exact convergence implementation and replay checks | [Shared rules](../src/shared/convergence.ts), [detector](../src/main/backend/convergence-script.ts), [detector tests](../src/main/backend/convergence-script.test.ts) |
| Exported metadata, snapshot evidence, and report contents | [Model metadata](../src/main/jobs/namModelMetadata.ts), [report data](../src/main/reports/report-data.ts), [report evidence](../src/main/reports/report-evidence.ts) |

Drafts live in `drafts.json`; queue and history records live in `queue.json` under the application's data directory. Generated `data.json`, `model.json`, `learning.json`, `stopping-policy.json`, and `esr-history.jsonl` belong to a run's workspace. The wrapper adds its Lightning callback around the installed `nam-full` entry point, records validation history, and handles `training-controls/` requests at safe boundaries. Snapshot export loads a separate CPU model, preserves normalization hooks, and keeps the live model, optimizer, and training random state intact.

Older pending records without a frozen preset capture the available library recipe during recovery. If the recipe is missing, the run becomes a visible missing-preset failure. Old finished records may still have no recipe snapshot. Snapshot paths are tracked separately from final models, so an intermediate export cannot make an incomplete run appear successful.

Per-model export metadata belongs under `metadata.nam_bot.packed_submodels`; NAM-BOT's epoch, preset, and latency attribution belongs under `metadata.nam_bot`. The primary ESR remains `metadata.training.validation_esr`. Legacy `metadata.training.nam_bot` values are migrated when NAM-BOT rewrites that metadata.
