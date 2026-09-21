import { type JSX, useState } from 'react'
import PropertySheet, { PropertySection } from '../../components/PropertySheet'
import CopyableCodeBlock from '../../components/CopyableCodeBlock'

const GUIDE_SECTIONS = [
  { id: 'guide-existing', label: 'Existing setup' },
  { id: 'guide-new', label: 'New environment' },
  { id: 'guide-links', label: 'Links' }
]

type GuideMode = 'standard' | 'nvidia' | 'apple' | 'amd' | 'intel'

interface GuideOption {
  id: GuideMode
  label: string
  description: string
}

const guideOptions: GuideOption[] = [
  {
    id: 'standard',
    label: 'Standard / CPU (Windows)',
    description: 'Train on the processor, or start here if you are unsure about your GPU.'
  },
  {
    id: 'nvidia',
    label: 'NVIDIA CUDA',
    description: 'Use this if you have an NVIDIA GPU and want local CUDA acceleration for training.'
  },
  {
    id: 'amd',
    label: 'AMD ROCm (Windows)',
    description: 'Check your exact GPU and Windows version against AMD’s support matrix.'
  },
  {
    id: 'apple',
    label: 'Apple Silicon',
    description: 'Use this if you are on an Apple Silicon Mac and want Metal acceleration.'
  },
  {
    id: 'intel',
    label: 'Intel Mac',
    description: 'Connect an existing compatible environment; current PyTorch binaries have platform limits.'
  }
]

function GuideToggle({
  option,
  isActive,
  onSelect
}: {
  option: GuideOption
  isActive: boolean
  onSelect: (mode: GuideMode) => void
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary guide-toggle-btn"
      title="Show setup instructions for this hardware choice. Selecting a guide does not install software or change the backend." aria-pressed={isActive}
      onClick={() => onSelect(option.id)}
    >
      <span className="guide-toggle-label">{option.label}</span>
      <span className="guide-toggle-desc">
        {option.description}
      </span>
    </button>
  )
}

function renderGuideIntro(mode: GuideMode): JSX.Element {
  if (mode === 'nvidia') {
    return (
      <div style={{
        backgroundColor: 'rgba(0, 243, 255, 0.05)',
        padding: '12px',
        borderLeft: '4px solid var(--neon-cyan)',
        marginBottom: '16px'
      }}>
        <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
          <strong>NVIDIA path:</strong> Choose a PyTorch CUDA build that supports your GPU and driver, then verify GPU access in Diagnostics.
        </p>
      </div>
    )
  }

  if (mode === 'apple') {
    return (
      <div style={{
        backgroundColor: 'rgba(0, 243, 255, 0.05)',
        padding: '12px',
        borderLeft: '4px solid var(--neon-cyan)',
        marginBottom: '16px'
      }}>
        <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
          <strong>Apple Silicon path:</strong> Use the standard PyTorch install. NAM-BOT will check for MPS availability on the Diagnostics page.
        </p>
      </div>
    )
  }

  if (mode === 'amd') {
    return (
      <div style={{
        backgroundColor: 'rgba(0, 243, 255, 0.05)',
        padding: '12px',
        borderLeft: '4px solid var(--neon-cyan)',
        marginBottom: '16px'
      }}>
        <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
          <strong>AMD ROCm path:</strong> Check your exact GPU and operating system in <a href="https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html" target="_blank" rel="noopener noreferrer">AMD’s Windows support matrix</a> first. Support applies to individual models, not every card in a Radeon series. This path uses Python 3.12.
        </p>
      </div>
    )
  }

  if (mode === 'intel') {
    return (
      <p className="ui-text-body">
        NAM-BOT has an Intel Mac build, but PyTorch ended official Intel Mac binaries after the 2.2 series; see the <a href="https://pytorch.org/blog/pytorch2-2/" target="_blank" rel="noopener noreferrer">PyTorch announcement</a>.
        Use <strong>Existing setup</strong> to connect a compatible NAM environment when available. A fresh Intel environment needs compatible older dependencies and is not covered by the Apple Silicon instructions.
      </p>
    )
  }

  return (
    <div style={{
      backgroundColor: 'rgba(255, 0, 65, 0.05)',
      padding: '12px',
      borderLeft: '4px solid var(--neon-magenta)',
      marginBottom: '16px'
    }}>
      <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
        <strong>Standard path:</strong> Install the CPU build for Windows. You can install a compatible GPU build later.
      </p>
    </div>
  )
}

function renderTorchInstall(mode: GuideMode): JSX.Element {
  if (mode === 'nvidia') {
    return (
      <>
        <p className="ui-text-body">
          Open the <a href="https://pytorch.org/get-started/locally/" target="_blank" rel="noopener noreferrer">PyTorch installation selector</a>.
          Choose Stable, Windows, Pip, Python, and a CUDA version supported by your GPU and driver. Run its installation command in the activated environment.
          If you are replacing a different PyTorch build, remove that build first:
        </p>
        <CopyableCodeBlock
          label="Remove an existing PyTorch build"
          command="python -m pip uninstall -y torch torchvision torchaudio"
        />
        <CopyableCodeBlock
          label="Verify CUDA after installation"
          command={'python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.device_count()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)"'}
        />
        <p className="ui-text-body" style={{ color: 'var(--text-steel)', marginTop: '-8px', marginBottom: '16px' }}>
          Expect a CUDA build value, <strong>True</strong> for GPU availability, and your GPU’s name. If it prints False, check the selected wheel and driver requirements before training.
        </p>
      </>
    )
  }

  if (mode === 'amd') {
    return (
      <>
        <p className="ui-text-body">
          Follow <a href="https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html" target="_blank" rel="noopener noreferrer">AMD’s native Windows PyTorch instructions</a> for the graphics driver, ROCm environment packages, and PyTorch packages.
          Run the commands for your shell in the activated environment and keep all packages from the same documented release.
        </p>
        <CopyableCodeBlock
          label="Verify ROCm after installation"
          command={'python -c "import torch; print(\'CUDA Available:\', torch.cuda.is_available()); print(\'HIP Version:\', torch.version.hip)"'}
        />
        <p className="ui-text-body" style={{ color: 'var(--text-steel)', marginTop: '-8px', marginBottom: '16px' }}>
          Expected result: <strong>CUDA Available: True</strong> and <strong>HIP Version:</strong> shows a version string. Note: torch.version.cuda will be None for ROCm builds.
        </p>
      </>
    )
  }

  return (
    <>
      {mode === 'apple' && (
        <>
          <p className="ui-text-body">Check <a href="https://developer.apple.com/metal/pytorch/" target="_blank" rel="noopener noreferrer">Apple’s PyTorch requirements</a> for your macOS version. Install Xcode command-line tools if needed:</p>
          <CopyableCodeBlock label="Install Apple command-line tools" command="xcode-select --install" />
        </>
      )}
      <CopyableCodeBlock
        label="Install PyTorch"
        command={mode === 'apple' ? 'python -m pip install torch' : 'python -m pip install torch --index-url https://download.pytorch.org/whl/cpu'}
      />
      {mode === 'apple' && (
        <>
          <CopyableCodeBlock label="Verify Apple GPU access" command={'python -c "import torch; print(torch.__version__); print(torch.backends.mps.is_available())"'} />
          <p className="ui-text-body">Expect <strong>True</strong> for MPS availability. If it prints False, check macOS, the Python architecture, and PyTorch against Apple’s requirements.</p>
        </>
      )}
    </>
  )
}

export default function Help() {
  const [guideMode, setGuideMode] = useState<GuideMode>('standard')

  return (
    <PropertySheet sections={GUIDE_SECTIONS} navigationLabel="Setup guide sections" className="reference-workspace setup-guide-workspace">
      <div className="panel editor-sheet">
        <PropertySection id="guide-existing" title="Existing setup">

          <div className="guide-content">
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              NAM-BOT needs a Conda environment containing Neural Amp Modeler and PyTorch. The desktop installer installs the app; the environment runs your training.
              If NAM already works on this machine, connect that environment below.
            </p>
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              NAM-BOT checks package metadata before importing NAM or Lightning and blocks compromised Lightning versions <strong>2.6.2</strong> and <strong>2.6.3</strong>.
              If either was installed, follow the <a href="https://github.com/Lightning-AI/pytorch-lightning/security/advisories/GHSA-w37p-236h-pfx3" target="_blank" rel="noopener noreferrer">maintainers’ recovery advisory</a> before reusing the environment; replacing the package alone does not address possible credential exposure.
              Use <strong>neural-amp-modeler 0.13.0 or newer</strong> for fresh installs and A2 training.
            </p>

            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
                <strong>Use this path if:</strong> you can already run NAM training from its built-in GUI or from your existing terminal workflow and just want NAM-BOT to use that same environment.
              </p>
            </div>

            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
                <strong>macOS note:</strong> use <strong>Terminal</strong> instead of Command Prompt or PowerShell, expect the Conda command to be <code style={{ color: 'var(--neon-cyan)' }}>conda</code>, and on Apple Silicon the accelerator path is <strong>MPS</strong> rather than CUDA.
              </p>
            </div>

            <h3 className="guide-step-title">
              1. Open Settings
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Go to <strong>Settings</strong> in the left menu</li>
              <li>Use the detected Conda executable, or browse to the executable used by your installation</li>
              <li>Choose <strong>Conda Environment Name</strong> or <strong>Conda Environment Prefix</strong></li>
              <li>Enter the environment name or its folder’s full path. A prefix points to the environment folder, not its Python executable</li>
            </ol>
            <CopyableCodeBlock label="List Conda environments" command="conda env list" />
            <p className="ui-text-body">Run this in Anaconda Prompt on Windows or Terminal on macOS to find environment names and paths.</p>

            <h3 className="guide-step-title">
              2. Wait for Saved
            </h3>
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              Settings save automatically after a short pause. Wait for <strong>Saved</strong> in the toolbar. <strong>Validate Backend</strong> also saves the visible settings before checking them.
            </p>

            <h3 className="guide-step-title">
              3. Check Diagnostics
            </h3>
            <p style={{ color: 'var(--text-steel)', marginBottom: '8px' }}>
              Open <strong>Diagnostics</strong> and confirm the summary tiles and check matrix show:
            </p>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', marginBottom: '16px' }}>
              <li><strong>Backend</strong> is ready</li>
              <li><strong>Training Launch</strong> is ready</li>
              <li><strong>Accelerator</strong> shows the GPU you expect, if you plan to train with GPU acceleration</li>
              <li><strong>NAM Version</strong> is 0.13.0 or newer for A2 presets</li>
            </ol>
            <p className="ui-text-body">CPU-only status is expected for the Standard path. If a check fails, follow <strong>Actions</strong>, then <strong>Re-check All</strong>. For help, open <strong>Advanced details &gt; Show Details</strong> and use <strong>Copy AI Prompt</strong> or <strong>Copy Raw JSON</strong>. Review these before sharing; they contain local environment paths and machine details.</p>

            <h3 className="guide-step-title">
              4. Start Using NAM-BOT
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Jobs</strong></li>
              <li>Choose <strong>New Job</strong>, or use <strong>Add audio files</strong> to add a captured output recording</li>
              <li>Choose <strong>Default</strong> input if you captured the bundled NAM V3 signal. Otherwise choose <strong>Custom</strong> and select the dry signal used for your recording. <strong>Save Default to Disk</strong> exports the bundled signal for making a new capture</li>
              <li>Select the captured output audio and a preset. The initial default, <strong>A2 Standard</strong>, uses Balanced auto convergence with a 2,000-epoch maximum and can finish earlier</li>
              <li>Review latency, the model output folder, filename options, and optional PNG/HTML reports. <strong>Auto-align</strong> recognizes NAM signals; use a known manual delay for other inputs</li>
              <li>Choose <strong>Save Job</strong>, then <strong>Queue</strong> on the draft</li>
            </ol>
            <p className="ui-text-body">Monitor progress in Jobs or Dashboard. In Jobs, <strong>Save Snapshot</strong> exports the best available checkpoints while training continues. <strong>Stop</strong> there offers save-and-stop, discard, or keep-training choices. Dashboard’s Stop cancels directly. After restarting the app, use <strong>Resume Queue</strong> to continue waiting jobs.</p>
            <p className="ui-text-body">Open the finished card’s model or output-folder link to find your <code>.nam</code> file, then load it into a compatible Neural Amp Modeler player.</p>
          </div>
        </PropertySection>

        <PropertySection id="guide-new" title="Set up NAM from scratch">

          <div className="guide-content">
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              Use this section if you do <strong>not</strong> already have a working NAM environment and need to build one from the beginning.
              Pick the setup path that matches your machine so you only see the PyTorch instructions that apply to you.
            </p>

            <div className="guide-toggle-grid">
              {guideOptions.map((option) => (
                <GuideToggle
                  key={option.id}
                  option={option}
                  isActive={guideMode === option.id}
                  onSelect={setGuideMode}
                />
              ))}
            </div>

            {renderGuideIntro(guideMode)}

            {guideMode !== 'intel' && (
              <>
            <h3 className="guide-step-title">
              1. Install Miniconda
            </h3>
            <p style={{ color: 'var(--text-steel)', marginBottom: '8px' }}>
              Install <a href="https://www.anaconda.com/docs/getting-started/installation" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)' }}>Miniconda</a>, or use your existing Anaconda installation.
            </p>
            <p style={{ color: 'var(--text-steel)' }}>
              On Windows, accept the installer defaults and open <strong>Anaconda Prompt</strong> from the Start menu. On macOS, follow the shell-initialization instructions and open a new <strong>Terminal</strong> window.
            </p>
            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p className="ui-text-body" style={{ color: 'var(--text-steel)', margin: 0 }}>
                Adding Conda to the global PATH is optional. NAM-BOT can use the full executable path in Settings.
              </p>
            </div>
            <p className="ui-text-body" style={{ color: 'var(--text-steel)', marginTop: '-4px', marginBottom: '16px' }}>
              On Apple Silicon, choose the Apple Silicon installer. For an unsigned macOS app, follow <a href="https://support.apple.com/en-us/102445" target="_blank" rel="noopener noreferrer">Apple’s instructions for opening a trusted app</a> if Gatekeeper prevents the first launch.
            </p>

              <>
                <h3 className="guide-step-title">
                  2. Create NAM Environment
                </h3>
                <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
                  In Anaconda Prompt on Windows or Terminal on macOS, run these commands <strong>one at a time</strong>. If an environment named <code>nam</code> already exists, connect it through Existing setup or choose a different name here and in Settings.
                </p>

                <CopyableCodeBlock
                  label="Step A: Create Environment"
                  command={guideMode === 'amd' ? 'conda create -n nam python=3.12 -y' : 'conda create -n nam python=3.11 -y'}
                />
                <CopyableCodeBlock
                  label="Step B: Activate"
                  command="conda activate nam"
                />
              </>

            <h3 className="guide-step-title">
              3. Install PyTorch for This Machine
            </h3>
            {renderTorchInstall(guideMode)}

              <CopyableCodeBlock
                label="Install Neural Amp Modeler after PyTorch"
                command={'python -m pip install --upgrade "neural-amp-modeler>=0.13.0"'}
              />
            <CopyableCodeBlock label="Check NAM version" command="python -m pip show neural-amp-modeler" />
            <CopyableCodeBlock label="Check package dependencies" command="python -m pip check" />

            <h3 className="guide-step-title">
              4. Configure NAM-BOT
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Settings</strong></li>
              <li>Leave the default Conda executable unchanged unless your install needs a custom path</li>
              <li>Leave the default environment name as <code style={{ color: 'var(--neon-cyan)' }}>nam</code> unless you intentionally created a different environment</li>
              <li>Under <strong>Folders</strong>, choose a <strong>Default Model Output Root</strong> for run subfolders containing models, checkpoints, and training logs. <strong>Workspace Root</strong> separately holds NAM-BOT's generated configs, training controls, ESR history, and working terminal logs</li>
              <li>Wait for <strong>Saved</strong> in the toolbar</li>
            </ol>

            <h3 className="guide-step-title">
              5. Validate
            </h3>
            <p style={{ color: 'var(--text-steel)' }}>
              NAM-BOT validates the selected setup automatically on startup. You can always go to <strong>Diagnostics</strong> and click <strong>Re-check All</strong> to inspect backend readiness, Training Launch readiness, GPU visibility, and NAM version detection together.
            </p>
            <p className="ui-text-body" style={{ color: 'var(--text-steel)', marginTop: '8px' }}>
              On Windows, GPU diagnostics check for both NVIDIA CUDA and AMD ROCm GPUs. On Apple Silicon, the same screen also reports whether PyTorch can see <strong>MPS</strong>.
            </p>

            <h3 className="guide-step-title">
              6. Create a Job
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Jobs</strong></li>
              <li>Choose <strong>New Job</strong></li>
              <li>Match the input signal to the captured output recording, as described in Existing setup</li>
              <li>Review the preset, training mode, latency, and output options</li>
              <li>Click <strong>Save Job</strong>, then <strong>Queue</strong></li>
            </ol>
              </>
            )}
          </div>
        </PropertySection>

        <PropertySection id="guide-links" title="Links">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href="https://github.com/sdatkinson/neural-amp-modeler" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              NAM GitHub
            </a>
            <a href="https://www.anaconda.com/docs/getting-started/installation" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Anaconda / Miniconda
            </a>
            <a href="https://pytorch.org/get-started/locally/" target="_blank" rel="noopener noreferrer" className="btn btn-green">
              PyTorch Install Guide
            </a>
            <a href="https://github.com/daveotero/NAM-BOT/tree/main/docs" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              NAM-BOT Guides
            </a>
          </div>
        </PropertySection>
      </div>
    </PropertySheet>
  )
}
