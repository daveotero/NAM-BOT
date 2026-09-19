# Setup Guide

NAM-BOT uses an existing Conda environment, addressed by its name or full environment-folder path. Direct Python executable and standalone virtual-environment modes are not supported.

The guide uses the shared section navigation for Existing setup, New environment, and Links. The current section has the same muted gray highlight as the editors; jumps scroll smoothly and focus the heading, with immediate scrolling for reduced-motion preferences. Section dividers, spacing, and copyable command blocks use the shared workspace styles. Hardware choices remain within the new-environment instructions, with a muted selected state. The setup sequence and platform-specific commands are unchanged.

1. If NAM already works in Conda, select that environment in Settings. Otherwise follow the in-app Standard, NVIDIA CUDA, AMD ROCm, or Apple Silicon setup instructions.
2. Settings save automatically after a short pause. The Save Settings button also saves immediately and reports errors.
3. Open Diagnostics to check backend access, accelerator support, training launch, and the installed NAM version. Re-check All refreshes those results.
4. Follow the complete ordered repair procedure for the primary issue. CUDA repair includes both removing the current Torch build and installing the CUDA build; verification commands alone do not repair an environment.
5. Create a job or batch. All audio selectors accept WAV, MP3, FLAC, AIFF, and AIF; NAM's installed audio decoders must support the chosen file. WAV is recommended for capture workflows.
6. Save the draft, then queue it. A2 requires NAM 0.13.0 or newer. A diagnostics-blocked queue card links back to Diagnostics.

After restarting NAM-BOT, select Resume Queue to continue saved pending jobs. If a previous force-stop could not be confirmed, stop that trainer in the system process manager before confirming Resume.
