# Presets

A preset is a reusable training recipe: model architecture, learning settings, optional stopping defaults, and any advanced NAM configuration. A [job](jobs-system.md) adds the capture audio, output destination, model metadata, and choices for that particular run.

Start with a bundled preset, then use **Customize** when you want to change it. Your copy stays in the library alongside the original.

Bundled preset names update with the app, including on existing installations. Custom copies keep their saved names, and queued or past runs retain the recipe captured when they were queued.

## Choose a preset

Open **Presets** to compare recipes. Select **Show More**, or the row background, to inspect training values, technical details, and every tier in a packed model. The A2, A1, and Custom badges identify architecture groups.

| Bundled preset | Models in the export | Stopping default | Fixed-mode epoch default |
| --- | --- | --- | ---: |
| A2 Standard | Lite (3 channels), Full (8 channels) | Balanced auto convergence, maximum 2,000 epochs | 200 |
| A2 Heavy 12 | Lite, Full, Heavy (12 channels) | Balanced auto convergence, maximum 2,000 epochs | 400 |
| A2 Ultra 20 | Lite, Full, Heavy, Ultra (16 channels), Mammoth (20 channels) | Obsessive auto convergence, maximum 2,000 epochs | 666 |
| Standard, Lite, Feather, and Nano WaveNet | One A1 model of the chosen architecture | Last used | 100 |

A2 Standard is the initial default. It trains several embedded models together and exports them in one `.nam` file. Heavy 12 and Ultra 20 are experimental packs with larger tiers; they increase model capacity and playback CPU cost, without guaranteeing a better result for every capture. A2 training requires NAM `0.13.0` or later; [Diagnostics](diagnostics.md) checks the installed environment.

The A1 WaveNet recipes remain available for A1 workflows. The editor also supports LSTM and custom recipes. The selected NAM environment must support the configuration you give it.

Set **Settings > Application > Default preset** to choose the recipe for new jobs, added audio, and fresh batches. Selecting a preset for one job does not change this setting. Existing drafts and explicit templates keep their own preset selection.

### Find and organize recipes

Use **All**, **A2**, **A1**, or **Custom** to filter the library. Search matches names, descriptions, model families, and architecture tags without regard to case. The count shows matching presets out of all visible presets. Saving or importing clears the filters so the saved recipe is visible.

The library groups A2 first, then A1, then Custom. User recipes appear before bundled recipes within an architecture group. Filters leave that order intact and do not change the saved recipes.

## Customize or create a preset

1. Select **Customize** on a bundled preset, **Duplicate** on a user preset, or **New Preset** for a fresh recipe.
2. Give the preset a name and a description that explains what you changed or intend to test. Category is a descriptive label; it does not affect training or the library’s architecture grouping.
3. Review **Architecture**, **Training**, and **Loss & levels**. The information controls explain individual fields.
4. Add **Created By** and **Website / Profile** if you plan to share the recipe. New presets start with the author defaults from [Settings](settings.md).
5. Select **Save Preset**. Choose the saved recipe when creating or editing a job.

User presets also have **Edit**, **Export**, **Copy Preset JSON**, and **Delete** actions. Bundled presets are read-only and remain available after you customize them. Updating the app does not rewrite your saved user copies.

The editor's section buttons scroll through **Preset**, **Architecture**, **Training**, **Loss & levels**, and **Overrides**. Save and Cancel stay at the top. Save becomes available when the editor has valid changes. Cancel and navigation prompts protect unsaved work; failed saves retain your edits.

### Training-mode defaults

| Preset setting | New jobs receive |
| --- | --- |
| Auto convergence | The preset's Fast, Balanced, or Obsessive threshold and required maximum epoch count. |
| Fixed epochs | Fixed mode with the preset's default epoch count, unless an expert override controls it. |
| Last used | Your remembered job mode, threshold, and safety limit. With no saved choice, Balanced auto convergence and a 2,000-epoch limit. |

An explicit preset policy takes precedence over remembered job preferences. In a job, changing the mode, threshold, limit, or fixed epoch count creates an override that survives switching presets. **Use preset** restores the selected preset's stopping defaults and fixed epoch count.

Each new job receives a copy of its stopping policy. Editing the preset later does not change the resolved stopping rules in saved drafts or templates. Queueing freezes the complete recipe for that run. See [training mode and convergence](jobs-system.md#training-mode-and-convergence) for what the thresholds measure and how packed models qualify.

Audio paths, latency, selected packed tiers, filenames, reports, and exported model metadata are job settings. They are not saved as part of a shared preset.

### Training fields

| Field | What it controls |
| --- | --- |
| NAM Architecture | The A2, A1, or Custom architecture classification. |
| Model Family | Packed WaveNet, WaveNet, or LSTM. A2 uses Packed WaveNet; WaveNet and LSTM support A1 and custom recipes. |
| Architecture | Packed for A2, the Standard/Lite/Feather/Nano templates for A1, or a custom configuration. |
| Default epochs | The target when a job uses Fixed epochs. Auto convergence uses its Maximum epochs limit instead. |
| Batch Size | Training examples processed together. Larger batches use more memory; reduce this if the environment runs out of memory. |
| NY | Training window length in samples. Longer windows give the model more signal context and cost more memory and time. |
| Learning Rate | The size of optimizer updates. |
| LR Decay | How quickly the learning rate falls after each epoch. Zero keeps it constant; the generated scheduler uses `gamma = max(0, 1 - decay)`. |
| MRSTFT / MRSTFT Weight | For A2, the read-only status follows the weight: above zero enables the frequency-aware loss; zero disables it. A1 also uses the Fit MRSTFT checkbox. |
| Weight Decay | Optimizer regularization where supported by the generated model configuration. |
| Output Normalize RMS dB | The A2 training-output normalization target. The export compensates for that normalization. |

The A2 MRSTFT status in the editor and library reflects the effective weight, including a direct `loss.mrstft_weight` override in Model JSON. When that override locks the weight field, change its value in Model JSON.

The bundled A2 presets use batch size `16`, learning rate `0.004`, decay `0.006`, NY `8192`, MRSTFT enabled at `0.0005`, weight decay `0.000000317`, and output normalization at `-18 dB RMS`. Their stopping and fixed epoch defaults differ as shown above. The visible bundled A1 WaveNet presets use decay `0.007`, MRSTFT weight `0.0002`, no weight decay, and no output normalization.

## Packed models and larger custom packs

A packed preset defines a collection of embedded models. **Show More** lists the entire collection, including tiers from an imported custom pack. Heavy 12 has three tiers; Ultra 20 has five. The standard two-tier A2 preset remains available when you want Lite and Full only.

In the job editor, packs with three or more tiers expose a **Packed models** checklist. All tiers start selected, and at least one must remain selected. This lets a job train and export a subset of a larger pack while preserving the library recipe. Selecting a different preset resets the checklist to that preset's full collection.

Each tier has its own ESR curve and best checkpoint. Auto convergence waits for every selected tier to qualify. The largest exported tier supplies the primary ESR shown on the run card and in filename/metadata attribution; [Jobs](jobs-system.md#watch-training) explains how that differs from the latest validation result.

### Tier names and CPU estimates

Friendly tier names follow channel-count ranges. An imported `channels_22` model, for example, displays as A2 Colossal. Values outside these ranges retain their model name or channel count.

| Tier label | Channel range | Reference channels | Estimated playback CPU relative to A2 Full |
| --- | ---: | ---: | ---: |
| A2 Lite | 1 to 3 | 3 | 0.14× |
| A2 Full | 4 to 8 | 8 | 1.00× |
| A2 Heavy | 9 to 12 | 12 | 2.25× |
| A2 Ultra | 13 to 16 | 16 | 4.00× |
| A2 Mammoth | 17 to 20 | 20 | 6.25× |
| A2 Colossal | 21 to 24 | 24 | 9.00× |
| A2 Leviathan | 25 to 28 | 28 | 12.25× |

These are planning estimates from `(channels / 8)^2`, not benchmarks or training-time predictions. Host implementation, sample rate, block size, compiler optimization, and fixed overhead affect actual playback CPU use. Tier names describe model size; listen to the exports when comparing results.

### Define a custom pack

Customize an expanded pack or import a complete compatible recipe, then work in **Model JSON** under Overrides. Packed tiers come from `model.net.config.submodels[]`; a tier's identity includes its array index and name. The associated export settings must agree with the selected submodels.

**Model JSON** replaces the entire `net` block when you supply one. Keep a full valid PackedWaveNet network definition, including its submodels and export configuration. Copy or export a working recipe before editing it so you have the complete structure. The job's checklist later filters both the submodels and their matching `container_max_values` for that run.

The friendly controls do not construct arbitrary channel layouts. Advanced packs belong in the JSON override or an imported preset. The [shared model builders](../src/shared/training.ts) define NAM-BOT's bundled packed configurations and tier labeling.

## Preset file import / export

Use **Export** on any preset to save a standalone `.nam-bot-preset.json` file. It contains the training recipe, stopping policy when set, creator details, and origin metadata. **Copy Preset JSON** copies the full preset text to the clipboard.

To add a shared file to the library, select **Import Preset** in the Presets toolbar. NAM-BOT reads the file, preserves its author information, and saves an editable user-owned copy with a new ID. Imported bundled presets become user copies too. File import does not overwrite the bundled original.

**Import Preset** expects a NAM-BOT preset export. Use the editor's **Import JSON** mode for raw NAM configuration or model snippets.

## Apply pasted JSON

1. Create or edit a preset, then select **Import JSON** beside the editor heading.
2. Paste a complete NAM-BOT preset, a NAM `data`/`model`/`learning` configuration object, or a recognized WaveNet/LSTM model snippet.
3. Resolve any validation error, then select **Apply JSON**.
4. Review the technical fields in Manual Editor and select **Save Preset** to write the library entry.

Apply JSON updates the technical recipe in the current editor. It preserves your name, description, category, creator fields, and sharing metadata. A full preset with an explicit stopping policy replaces the editor's policy; raw configs and imports without one keep the current policy. Invalid policies are rejected.

JSON is validated while you type or paste, and Apply JSON stays disabled until the import is valid. Applying does not save the preset by itself. Switching away from entered JSON has a discard guard. The JSON editors provide formatting and error locations; Copy Preset JSON is available in the manual editor once the override blocks are valid.

## Expert overrides

Under **Overrides**, the optional blocks apply to these generated files:

| Editor block | Generated configuration |
| --- | --- |
| Data JSON | `data.json`: audio paths, delay, splits, normalization, and dataset options. |
| Model JSON | `model.json`: network, loss, optimizer, and learning-rate scheduler. |
| Learning JSON | `learning.json`: dataloaders, trainer, and fit options. |

Objects merge into the generated configuration; arrays and scalar values replace the corresponding values. A supplied model `net` replaces the whole generated network instead of merging A1 and A2 structures together.

When an override owns a friendly field, that control becomes read-only with a **JSON Override** badge. Hover the badge for the source and effective value. Change or remove the JSON override to use the friendly control again. An expert `data.common.delay` also locks the job's latency controls, and `trainer.max_epochs` locks its fixed epoch field.

Two job choices are applied after the base recipe and expert blocks: the packed-tier selection filters the finished network configuration, and auto convergence sets `trainer.max_epochs` to the job's safety limit. Explicit expert accelerator/device choices remain in place; automatic device detection applies to `accelerator: "auto"`.

The [Jobs technical reference](jobs-system.md#custom-input-splits) includes a custom-input data split example. The [config builder](../src/main/config/configBuilder.ts) is the exact reference for merge order and generated NAM keys.

## Editing, deletion, and recovery

Changes to a library preset affect future runs queued from drafts that reference it. Already queued and active runs retain a complete frozen recipe, and finished history retains its original attribution. Creating a new draft from history restores the job's choices and preset ID, so its next run uses the current library recipe. Keep separate preset copies when comparing recipe revisions.

Deleting your default preset resets **Settings > Application > Default preset** to A2 Standard. Existing drafts that referenced the deleted preset need an explicit replacement before saving or queueing; NAM-BOT does not silently substitute another recipe for them. Delete also removes older imports saved under an export filename and their recovery backups, so those presets do not reappear after restarting.

Use **File > Open Presets Folder** to see saved user recipes (`Ctrl+Shift+P` on Windows, `Cmd+Shift+P` on macOS). Each user preset has its own JSON file in the application's data directory. Bundled recipes come from the app and are not stored as editable files there.

User preset files retain `.bak` recovery copies. If the primary file is missing or invalid, NAM-BOT loads a valid backup and shows a notice in Presets and Jobs. If neither copy is usable, it reports the unreadable file. Deleting a preset removes its primary file and backup, so recovery does not bring a deliberately deleted recipe back.

## Format and source reference

The complete schema is `TrainingPresetFile` in [shared training types](../src/shared/training.ts). Export a preset to obtain a current, complete example rather than assembling one from a partial field list.

| Field group | Purpose |
| --- | --- |
| `schemaVersion: 1`, `presetKind: "training"` | Identifies the file format and preset type. |
| `id`, `name`, `description`, `category`, timestamps | Library identity and organization. |
| `builtIn`, `readOnly`, `visible` | Ownership and library visibility. |
| `values` | Friendly architecture, training, loss, and normalization fields. |
| `expert.data`, `expert.model`, `expert.learning` | Advanced overrides for generated NAM configs. |
| `stopping` | Optional fixed/convergence policy. Absence means Last used; the stored `thorough` level is displayed as Obsessive. |
| `lockedJobFields` | Derived epoch/latency locks from expert configuration. |
| `author`, `origin` | Optional creator credit and app/version provenance for sharing. |

Preset loading normalizes older files, fills missing fields, and infers architecture where possible: PackedWaveNet maps to A2, WaveNet/LSTM to A1, and unknown networks to Custom. Older flat WaveNet/LSTM expert snippets are normalized to the `expert.model.net.config` structure. Missing author/origin metadata is accepted. Legacy auto policies with no cap receive the current 2,000-epoch launch limit; invalid policies produce an error.

| Implementation detail | Source |
| --- | --- |
| Schema, defaults, built-in recipes, packed labels, and normalization | [Shared training model](../src/shared/training.ts) |
| Library sorting, file storage, collisions, and backup recovery | [Preset store](../src/main/persistence/presetStore.ts) |
| File import/export and origin metadata | [Preset IPC](../src/main/ipc/presets.ts) |
| Apply JSON preservation rules and fresh preset defaults | [Preset editor session](../src/renderer/features/presets/presetEditorSession.ts) |
| Editor controls, override detection, and JSON validation | [Preset editor](../src/renderer/features/presets/Presets.tsx) |
| Runtime configuration and merge precedence | [Config builder](../src/main/config/configBuilder.ts) |
