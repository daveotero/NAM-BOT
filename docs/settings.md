# Settings

Settings controls the Conda environment NAM-BOT uses, default folders and author details, and a few application preferences. Use the **Backend**, **Folders**, **Author**, and **Application** tabs to jump between sections.

Changes save automatically after a short pause. The toolbar shows **Unsaved changes**, **Saving...**, or **Saved**. There is no Save Settings button. If saving fails, the toolbar displays the error; resolve it before relying on the new values.

Changing notifications, author details, the default preset, the results-folder option, or the output folder keeps your existing diagnostic results. Changing the Conda environment or workspace location clears those results so Dashboard and Diagnostics can check the new setup. You can still run checks manually whenever needed.

## Connect your training environment

NAM-BOT uses a Conda environment containing Python, PyTorch, and Neural Amp Modeler. If you have not installed those yet, follow the [Setup Guide](setup-guide.md).

1. Set **Conda Executable Path** to your Conda executable. When NAM-BOT finds Conda on your system path, **Use PATH** selects it automatically; **Custom Path** lets you browse to a specific installation.
2. Choose a **Backend Mode**:
   - **Conda Environment Name** selects an environment by name, such as `nam`.
   - **Conda Environment Prefix** selects the full environment folder. Use the folder containing that environment, rather than the path to its Python executable.
3. Enter the environment name or prefix and choose **Validate Backend**. This saves the values currently shown before checking them.
4. Open **Diagnostics** to check accelerator support, training launch, and the installed NAM version as well.

**Backend Ready** confirms the basic environment check. A2 training also requires `neural-amp-modeler` 0.13.0 or newer, and the separate Training Launch check must be able to start the process NAM-BOT uses for training.

Changing the backend clears earlier readiness results so they can be checked against the new environment. A run already in progress keeps the environment it started with. NAM-BOT does not currently support selecting a standalone Python or virtualenv executable as its backend.

## Choose your folders

**Default Model Output Root** is the default parent folder for training output. Each run normally creates a timestamped subfolder there for its model, checkpoints, training logs, and selected reports. Each job can choose its own parent folder.

The job editor remembers your last output-folder mode. If you last chose a custom folder or the recorded output audio's folder, new jobs continue using that choice. To use the folder configured here, select the Settings default as the job's output-folder source. Without a remembered choice or a Settings default, new jobs use the output audio's folder once you select a recording.

**Workspace Root** stores each run's working files: generated configurations, training controls, ESR history, and working terminal logs. Models and checkpoints go in the run output folder, not here. Leave it blank to use NAM-BOT's default workspace inside its application data folder. Choose a writable location with room for the runs you intend to keep.

The model output folder and workspace serve different purposes. Use **Browse** beside either field to select its location. See the [Jobs guide](jobs-system.md) for per-job destinations and filename options.

## Set author defaults

**Default Author Name** supplies the initial author name for new presets and a fallback for **Modeled By** in new jobs. The job editor remembers the last nonempty Modeled By value from a saved job and uses that ahead of this default. Edit Modeled By in the job when you want to change it.

**Default Author URL** fills the author link for new presets, such as your website or profile page. Changing these defaults does not rewrite existing jobs or presets.

## Choose a default preset

**Default preset** selects the recipe for new jobs, files dropped or selected to create jobs, and batches started from fresh files. It starts with **A2 Standard** and offers the visible built-in and custom presets.

Existing drafts keep their selected recipe. A batch created from a template uses the template's recipe. Deleting your selected default in Presets resets the preference to A2 Standard. If the selected preset becomes unavailable in another way, Settings flags it and new jobs fall back to the app default.

Presets can also supply training-mode defaults. Review the chosen mode in each job before queueing it. The [Presets guide](presets-system.md) covers custom recipes and packed submodels.

## Results and notifications

**Automatically open results folder after training** opens the run's results folder in File Explorer or Finder when training completes successfully. It is off by default. Changes apply to runs started afterward.

On Windows, **Enable desktop notifications** is on by default. Notifications cover completed, failed, or canceled runs, plus queued A2 jobs waiting for Diagnostics. Clicking an alert opens the relevant Jobs or Diagnostics screen.

On macOS, the checkbox is unchecked and disabled, with an explanation beside it. Desktop notifications are unavailable in unsigned macOS applications, so NAM-BOT does not send them even if an older saved preference is enabled. Training results remain available in Jobs and Dashboard.

The notification preference takes effect for future alerts as soon as it saves, including alerts from a job already running. Re-enabling it does not replay alerts you missed. Your operating system's notification settings also apply.

Jobs history and the queue are saved automatically. For what happens to waiting or active jobs after an app restart, see the [Jobs guide](jobs-system.md).
