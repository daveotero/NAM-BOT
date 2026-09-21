# Dashboard

The Dashboard gives you a quick view of active training, your training record, and the environment NAM-BOT is using. Open [Jobs](jobs-system.md) when you want to create, queue, edit, or export a run.

![Dashboard showing an active training run, lifetime statistics, and diagnostic summaries](screenshots/dashboard.png)

The screenshot uses an example session with recorded training metrics.

## Job counts

The counter strip reflects the drafts and history currently retained in Jobs:

| Count | Includes |
| --- | --- |
| Drafts | Saved jobs that have not been queued. |
| Queued | Jobs waiting to run or being validated. |
| Training | Jobs preparing, running, stopping, or finalizing. |
| Completed | Successful runs still in Jobs history. |
| Errors | Failed and canceled runs still in Jobs history. |

These counts can change when you clear Jobs history. The lifetime totals in **Training record** are kept separately.

## Follow an active run

**Active Training** appears while a job is preparing, training, stopping, or finishing its exports. The card shows progress and the live ESR chart as results arrive. ESR measures the model's error against the recorded output; lower values indicate a closer fit on that validation data.

Use **Show Details** to inspect the run's preset, training mode, latency alignment, epochs, checkpoints, and device. **Show Logs** opens the training output and refreshes it while the run is active.

For **Auto convergence**, the progress percentage measures how much of the maximum epoch limit has been used. Training can finish earlier when the selected convergence level is reached. Fixed-epoch runs also display convergence feedback, but that feedback does not stop them. See the [Jobs guide](jobs-system.md) for choosing a training mode.

**Stop on the Dashboard cancels the run directly, without asking to save a model first.** To save a checkpoint while training continues, or choose **Save & stop**, open Jobs. **Save Snapshot** is available there once the run has a usable checkpoint.

If a run stops responding, the card can offer **Force Stop**. Stop controls disappear during finalization while NAM-BOT finishes processing the model. Action errors appear on the card.

## Lifetime training record

**Training record** keeps these totals even after finished jobs are cleared:

| Total | What it counts |
| --- | --- |
| Completed runs | Successful training jobs. A packed run counts once, regardless of how many submodels it contains. |
| Training time | Recorded start-to-finish time for finished runs, including failed and canceled runs. |
| Epochs trained | Recorded completed epochs from finished runs, including runs that ended early. |
| Most-used preset | The preset used for the most successful runs. |

The recent-runs table shows up to five successful runs, newest first, with model name, preset, local completion time, and duration. There is no age cutoff.

- **×** hides one row from the Dashboard.
- **Clear all** hides all currently completed runs from this list, including older rows beyond the five shown.

Hiding rows does not delete Jobs history, models, or reports, and does not change lifetime totals. New completions appear normally. To open a model's folder or save a report, find the finished run in Jobs.

NAM-BOT imports the history it still has when creating the training record. Runs cleared before this feature was installed cannot be recovered. Missing durations and epoch counts are left out rather than estimated; interrupted runs can therefore contribute incomplete statistics. If the record cannot be read, the Dashboard shows **Statistics unavailable** with **Retry**.

## Check environment health

The four **Diagnostics** tiles summarize Backend, Accelerator, Training Launch, and NAM Version. Missing results load in the background. **PASS** means a check is ready, **CHECK** needs attention, **FAIL** reports a failed check, and **SKIP** means a result is not yet available.

Choose **Open diagnostics** for repair steps, fresh checks, and troubleshooting exports. The [Diagnostics guide](diagnostics.md) explains what each check covers.

The bottom status bar stays available throughout the app. Its backend and accelerator items open Diagnostics; its current job and queue items open Jobs.
