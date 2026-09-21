# Diagnostics

Diagnostics checks whether NAM-BOT can reach your training environment, use its accelerator, and launch training. Start here if setup fails, training runs on an unexpected device, or a job will not start.

![Diagnostics showing the four readiness checks and the Actions section](screenshots/diagnostics.png)

The screenshot shows an example NVIDIA environment. Your device and environment details will reflect your own machine.

## Run the checks

Open **Diagnostics** from the sidebar. Checks load automatically. Choose **Re-check All** after changing Settings, installing packages, or applying a repair.

The page has four sections: **Overview**, **Actions**, **Check matrix**, and **Advanced details**. Start with Overview, follow the repair in Actions, then re-check. A successful Backend check alone does not establish that the whole training setup is ready.

## Read the four overview tiles

| Check | What it tells you |
| --- | --- |
| Backend | Whether NAM-BOT can reach Conda, the selected environment, Python, NAM, and its training command. |
| Accelerator | Whether PyTorch in that environment can use a supported GPU, or is running on CPU. |
| Training Launch | Whether NAM-BOT can start the process used for training and access its workspace. |
| NAM Version | The installed Neural Amp Modeler version, update information, and A2 compatibility. |

The status labels help distinguish a failure from advice:

- **PASS**: the check is ready. A CPU environment can pass when no NVIDIA GPU is detected.
- **CHECK**: read the recommendation. This can indicate a setup mismatch or an available package update; it does not always block training.
- **FAIL**: the check failed. Follow its repair guidance before retrying the affected operation.
- **SKIP**: the check has not completed or a result is not yet available.

CPU training is a valid choice. If NAM-BOT sees an NVIDIA GPU on the computer but the selected environment has CPU-only PyTorch, it flags the mismatch so you can decide whether to install a CUDA build. AMD ROCm and Apple MPS readiness are reported separately from NVIDIA driver detection.

The NAM Version tile checks the Python package used for training. Updates to the NAM-BOT desktop app are handled separately through [About and Check for Updates](about.md). A2 presets require `neural-amp-modeler` 0.13.0 or newer.

## Follow the Actions section

**Actions** puts the primary repair first, with an explanation, **How To Fix** steps, commands where needed, and a result to verify. **Open Settings** takes you to the configuration when the fix involves the environment or a folder.

On Windows, run the copied commands in **Anaconda Prompt (CMD)**; quoted executable paths in these blocks use CMD syntax. On macOS, use **Terminal**. The commands target the environment selected in Settings. Review them before running; opening Diagnostics does not install or repair packages. Return to NAM-BOT and choose **Re-check All** afterward.

When the checks pass, Actions shows **Ready To Train**. This confirms the environment and launch checks; a real training job still needs valid audio, a compatible preset, and enough resources.

| What you see | Where to start |
| --- | --- |
| Conda or the environment cannot be found | Check the executable path and environment name or prefix in [Settings](settings.md). |
| Python works, but NAM is missing or too old | Follow [Install Neural Amp Modeler](setup-guide.md#install-neural-amp-modeler) in the selected environment. |
| A GPU is visible, but PyTorch cannot use it | Follow the matching [hardware setup path](setup-guide.md#create-a-new-environment), then re-check. |
| Backend passes, but Training Launch fails | Read the launch repair. Check the workspace location and, on macOS, any reported application or helper permissions. |
| Lightning is blocked by the safety check | Follow the [Lightning security block](setup-guide.md#lightning-security-block) instructions. |
| Diagnostics itself could not complete | Read the error and choose **Re-check All** to retry. |

## Inspect individual results

**Check matrix** lists the checks behind the summaries, grouped by Backend, Accelerator, Training Launch, and NAM Version. Read the message beside a failing row; it can include a suggested fix or output from the failed command.

Under **Advanced details**, choose **Show Details** to see the exact environment and machine information used by the checks. This includes Python and package versions, the Python executable, GPU and driver details, CUDA/ROCm/MPS availability, the workspace, and application launch information. These details help identify cases where packages were installed in a different environment from the one NAM-BOT is using.

## Share a troubleshooting export

Inside Advanced details, **Troubleshooting Export** offers:

- **Copy AI Prompt**: a troubleshooting prompt with the current results, host context, and prepared repair commands.
- **Copy Raw JSON**: the diagnostic results in a structured format.
- **Show AI Prompt** and **Show Raw JSON**: previews you can review before copying.

These tools are available even when all checks pass. They copy text to your clipboard; NAM-BOT does not send it to an AI service or post it anywhere.

Review the preview before sharing it. Diagnostic exports include local environment and path details, unlike the limited fields included in a training report. Remove anything you do not want to publish, then include the relevant export when asking for help or [reporting an issue](https://github.com/daveotero/NAM-BOT/issues).
