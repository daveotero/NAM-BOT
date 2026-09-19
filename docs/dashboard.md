# Dashboard

## Overview

The Dashboard summarizes job activity, active training, and environment health. The compact counter strip and diagnostics section retain the original dashboard's focus. The attached sidebar, command strip, and bottom status bar remain available while the workspace scrolls.

## Jobs Overview

The top counter strip counts the current job buckets:

- Drafts
- Queued
- Training
- Completed
- Errors

These counts are read from the same draft and queue state used by the Jobs screen.

## Active Training

When any job is preparing, running, stopping, or finalizing, the Dashboard shows an `Active Training` section using the same runtime card component as the Jobs screen.

- running jobs can be expanded
- terminal logs can be shown and refreshed
- stop, force stop, and artifact actions report errors on the runtime card
- finalizing runs remain visible until model processing completes; stop controls are hidden during this finalization stage
- already-open logs fetch their final tail when a run ends

## Diagnostics Summary

The Dashboard `Diagnostics` section summarizes the same four checks as the Diagnostics screen:

- Backend
- Accelerator
- Training Launch
- NAM Version

The Dashboard loads missing diagnostic snapshots in the background so users see the same broad readiness picture without opening Diagnostics first.

### Status Labels

Each row uses the same basic status language as Diagnostics:

- `PASS` for ready checks
- `CHECK` for advisory or update-needed states
- `FAIL` for blocking failures
- `SKIP` when the check has not completed yet

The NAM Version card includes the A2 local-training requirement. A2 presets require `neural-amp-modeler>=0.13.0`.

## Commands and Status

The command strip offers `New job`; its hover hint includes the platform's existing keyboard shortcut. Settings, Diagnostics, and Jobs are accessible from the navigation menu without a duplicate row of dashboard shortcuts. No action starts training automatically.

## Lifetime Training Record

The training record displays completed runs, recorded training hours, epochs trained, and the most-used preset. A compact recent-runs table shows the five most recent successful runs, newest first, with model name, completion date, preset, and duration. There is no date cutoff, so occasional users still see their last captures. Before any successful runs, it shows `No completed runs yet`.

- Completed runs counts successful training jobs. A packed-model run counts once, regardless of the number of embedded models or intermediate exports.
- Training time sums recorded start-to-finish wall time for finished runs, including failed and canceled runs. It includes setup/finalization time within those timestamps. Runs with missing/invalid timestamps or unknown duration after an interrupted process are excluded.
- Epochs trained counts recorded epochs from finished runs, including early finishes. It does not substitute the planned epoch budget for missing progress evidence. Failed/canceled runs use checkpoint/ESR evidence rather than an in-progress epoch counter.
- Most-used preset counts successful runs per preset ID, using names frozen with each run. Older runs without a recorded recipe cannot supply a reliable preset name.
- Recent model names use the run's NAM metadata name when supplied, otherwise its job name. Unknown durations display a dash. Older ledger entries are backfilled from retained Jobs history; already-cleared records whose names were never captured display `Completed run`.

The main process stores a compact per-run ledger in `training-statistics.json` in the user's NAM-BOT data directory. It contains IDs, model names, timestamps, outcomes, durations, epoch counts, and preset identity, not audio paths or training logs. Existing retained history is imported automatically. Runs cleared before this feature was installed cannot be reconstructed. Clearing one or all finished jobs preserves both lifetime totals and the recent-runs list, including across app restarts. Repeated updates are deduplicated by run ID; retries have distinct IDs. Existing version-1 ledgers without model names remain readable.

Writes use the existing atomic-file/backup mechanism. History removal requires the run's statistics to be saved first. If the statistics file cannot be read, the dashboard shows an unavailable state rather than fabricated zero totals, and the existing file is preserved.

The persistent bottom bar reports backend readiness, accelerator readiness, current training activity, and the number of waiting jobs. During a run it includes the job name and available progress percentage. Status items open Diagnostics or Jobs through the same unsaved-editor guard used by the sidebar and application menu.

At narrower widths or higher zoom levels, the diagnostics grid changes from four columns to two. The sidebar and bottom bar remain accessible. The About terminal and title-bar logo animation retain their existing behavior.

The Dashboard should stay lightweight. Detailed troubleshooting, command copy blocks, raw check matrices, and AI troubleshooting exports belong on the Diagnostics screen.
