# Dashboard

## Overview

The Dashboard is the quick status view for NAM-BOT. It summarizes job activity, active training, environment health, and common next actions without requiring the user to visit each feature screen first.

## Jobs Overview

The top `Jobs Overview` panel counts the current job buckets:

- Drafts
- Queued
- Training
- Completed
- Errors

These counts are read from the same draft and queue state used by the Jobs screen.

## Active Training

When any job is preparing, running, or stopping, the Dashboard shows an `Active Training` section using the same runtime card component as the Jobs screen.

- running jobs can be expanded
- terminal logs can be shown and refreshed
- stop, force stop, and artifact actions report errors on the runtime card
- finalizing runs remain visible until model processing completes; stop controls are hidden during this finalization stage
- already-open logs fetch their final tail when a run ends

## Diagnostics Summary

The Dashboard `Diagnostics` panel mirrors the four summary tiles from the Diagnostics screen:

- Backend
- Accelerator
- Training Launch
- NAM Version

The Dashboard loads missing diagnostic snapshots in the background so users see the same broad readiness picture without opening Diagnostics first.

### Status Labels

Each card uses the same basic status language as Diagnostics:

- `PASS` for ready checks
- `CHECK` for advisory or update-needed states
- `FAIL` for blocking failures
- `SKIP` when the check has not completed yet

The NAM Version card includes the A2 local-training requirement. A2 presets require `neural-amp-modeler>=0.13.0`.

## Quick Actions

The `Quick Actions` panel links to the most common next screens:

- Configure Backend
- Run Diagnostics
- Create Job

The Dashboard should stay lightweight. Detailed troubleshooting, command copy blocks, raw check matrices, and AI troubleshooting exports belong on the Diagnostics screen.
