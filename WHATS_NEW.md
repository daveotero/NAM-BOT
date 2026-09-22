# What's new in NAM-BOT

## 0.7.0

Since **0.6.0**, NAM-BOT has gained a redesigned workspace, larger packed models, and more control over training and exports. This overview includes the intervening 0.6.x updates. See the [changelog](CHANGELOG.md) for individual fixes and the [README](README.md) to get started.

### A redesigned desktop application

Jobs, Presets, Settings, Diagnostics, and Setup Guide now share compact layouts and consistent controls. Main actions stay visible as you scroll, and the status bar keeps training and environment status in view.

The retro look remains, with clearer typography, native window controls, and layouts that adapt to smaller windows and higher zoom. Windows commands are available from the menu button or **F10**; macOS uses the standard application menu.

![NAM-BOT's redesigned Dashboard and desktop workspace](docs/screenshots/dashboard.png)

*Screenshots show example sessions using recorded training curves.*

### Larger packed models and more room to experiment

**Heavy 12** and **Ultra 20** add wider submodels to the standard A2 pack. Each preset trains its tiers together and exports one packed `.nam` file.

| Preset | Submodels trained together |
| --- | --- |
| A2 Standard | Lite (3 channels), Full (8) |
| A2 Heavy 12 | Lite (3), Full (8), Heavy (12) |
| A2 Ultra 20 | Lite (3), Full (8), Heavy (12), Ultra (16), Mammoth (20) |

Larger tiers offer more capacity at the cost of training time, memory, and playback CPU. Compare ESR and listen to decide whether they improve your capture. The **Packed models** checklist lets you train a subset of packs with three or more tiers.

For a rough playback-cost comparison, **A2 Full is the 1× baseline**:

| Playback tier | Channels | Approx. relative playback cost |
| --- | ---: | ---: |
| A2 Lite | 3 | 0.3× |
| A2 Full | 8 | 1× |
| A2 Heavy | 12 | 2× |
| A2 Ultra | 16 | 4× |
| A2 Mammoth | 20 | 6× |
| A2 Colossal (custom pack) | 24 | 9× |
| A2 Leviathan (custom pack) | 28 | 12× |

Lite's 0.3× is inferred from [TONE3000's published NAM A2 figures](https://www.tone3000.com/guides/nam-a2-the-complete-guide#how-efficient-are-a2-full-and-a2-lite). Larger tiers use theoretical estimates; actual CPU ratios can differ substantially by player and hardware. Values apply to the selected playback tier. See [estimate details](docs/presets-system.md#tier-names-and-rough-compute-estimates).

Choose **Customize** to make your own recipe, including training and stopping defaults. The [Presets guide](docs/presets-system.md) covers editing, sharing, and larger custom packs.

### Auto convergence: finish when progress settles

**Auto convergence** saves the best validated model and advances the queue when every exported submodel meets the stopping threshold. Choose **Fast** for earlier finishes, **Balanced** for a longer wait, or **Obsessive** to pursue smaller improvements.

Bundled A2 presets have a 2,000-epoch maximum: Standard and Heavy 12 use Balanced; Ultra 20 uses Obsessive. Each job can override its preset. **Fixed epochs** remains available, and both modes show convergence feedback as training progresses.

See [training mode and convergence](docs/jobs-system.md#training-mode-and-convergence) for details.

### Save the best model while training continues—or finish early

Once a validated checkpoint is available:

| Action | Result |
| --- | --- |
| Save Snapshot | Export the best weights so far and keep training. |
| Stop → Save & stop | Export the best weights and finish the run. |
| Stop → Discard & stop | Stop without a new export; existing files remain. |

Each packed tier exports its own best checkpoint, even when those checkpoints come from different epochs. Save a snapshot, listen, and keep experimenting. See [exports and stop choices](docs/jobs-system.md#export-during-training-and-stop-choices).

### See how every submodel is learning

Expanded Jobs cards show a separate **ESR curve for each submodel**. ESR measures error against the reference recording; lower is better. View the whole run or recent epochs, pin a point, and show or hide individual curves.

Saved-model ESR reflects the best checkpoints, so it can differ from the latest graph point. Recorded chart history stays with finished runs across restarts.

![Training progress, packed-model ESR curves, and snapshot controls in Jobs](docs/screenshots/jobs.png)

### Share the results as well as the recipe

Export a **PNG summary** or an **interactive, offline HTML report** with training details, saved-model ESR, and the graph. Enable reports under **Model output → Training reports**, or choose **Save Report** on a finished job.

Reports keep the measurements from the export moment and omit private notes, terminal logs, and full local paths. Shared presets now carry their stopping settings too.

<details>
<summary>Example PNG training report</summary>

<img src="docs/screenshots/training-report.png" alt="A NAM-BOT training report showing saved-model ESR and the recorded training curves" />

</details>

Read more about [training reports](docs/jobs-system.md#branded-training-reports) and [preset sharing](docs/presets-system.md#preset-file-import--export).

### Other improvements you'll notice

- Automatic latency alignment for recognized NAM training signals, with manual adjustment available.
- A batch editor for shared job settings, plus draggable draft ordering.
- Job search, a configurable default preset, and live filename previews.
- Lifetime training totals on Dashboard and dismissible recent runs.
- Logs that stay where you scroll, with smoother handling during long runs.
- Optional Windows training notifications that open the relevant screen.
- Direct links to saved files and an optional model copy beside the capture audio.

### More reliable long-running sessions

Queued jobs retain their recipes, even if a preset changes. Resume pending jobs after a restart, recover drafts from backups, or create a new draft from a failed or stopped run.

Long batches keep sleep prevention active. A forced stop pauses the queue if the previous trainer's shutdown cannot be confirmed. macOS packaging also fixes a helper issue that could prevent training from starting.

### Moving from 0.6.0

- A2 requires NAM **0.13.0 or newer**. Run **Diagnostics → Re-check All** after changing the training environment.
- Existing jobs and templates keep their stopping settings; new jobs use the selected preset's defaults.
- Older jobs without chart history cannot reconstruct it. Snapshots require the updated training support and a validated checkpoint.
- Older Direct Python configurations migrate to Conda defaults. Check **Settings** and the [Setup Guide](docs/setup-guide.md) if affected.

Some frequencies remain absent from the station log. The switchboard has been listening after hours.
