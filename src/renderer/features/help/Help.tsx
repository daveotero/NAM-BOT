import { type JSX, useState } from 'react'
import PropertySheet, { PropertySection } from '../../components/PropertySheet'
import CopyableCodeBlock from '../../components/CopyableCodeBlock'

const GUIDE_SECTIONS = [
  { id: 'guide-existing', label: 'Existing setup' },
  { id: 'guide-new', label: 'New environment' },
  { id: 'guide-links', label: 'Links' }
]

type GuideMode = 'standard' | 'nvidia' | 'apple' | 'amd'

interface GuideOption {
  id: GuideMode
  label: string
  description: string
}

const guideOptions: GuideOption[] = [
  {
    id: 'standard',
    label: 'Standard / Unsure',
    description: 'Use this if you are not sure what GPU you have, or if you plan to run on CPU.'
  },
  {
    id: 'nvidia',
    label: 'NVIDIA CUDA',
    description: 'Use this if you have an NVIDIA GPU and want local CUDA acceleration for training.'
  },
  {
    id: 'amd',
    label: 'AMD ROCm (Windows)',
    description: 'Use this if you have an AMD Radeon RX 7000/9000 or PRO W7000 series GPU on Windows.'
  },
  {
    id: 'apple',
    label: 'Apple Silicon',
    description: 'Use this if you are on an Apple Silicon Mac and want Metal acceleration.'
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
      aria-pressed={isActive}
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
        <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
          <strong>NVIDIA path:</strong> This flow explicitly replaces a CPU-only PyTorch install with a CUDA-enabled build.
          If you previously installed the wrong torch build, follow the NVIDIA commands exactly and then verify the result in Diagnostics.
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
        <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
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
        <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
          <strong>AMD ROCm path:</strong> Requires Python 3.12 and official AMD ROCm wheels. This installs ROCm-enabled PyTorch for AMD GPU acceleration on Windows.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: 'rgba(255, 0, 65, 0.05)',
      padding: '12px',
      borderLeft: '4px solid var(--neon-magenta)',
      marginBottom: '16px'
    }}>
      <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
        <strong>Standard path:</strong> This is the safest option if you are unsure about your GPU. You can always switch later after Diagnostics tells you what the environment can see.
      </p>
    </div>
  )
}

function renderTorchInstall(mode: GuideMode): JSX.Element {
  if (mode === 'nvidia') {
    return (
      <>
        <CopyableCodeBlock
          label="Step C: Remove Wrong Torch Build"
          command="pip uninstall -y torch"
        />
        <CopyableCodeBlock
          label="Step D: Install CUDA PyTorch"
          command="pip install --index-url https://download.pytorch.org/whl/cu130 --no-cache-dir torch==2.10.0+cu130"
        />
        <CopyableCodeBlock
          label="Step E: Verify CUDA Torch"
          command={'python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.device_count()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)"'}
        />
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          Expected result: the version string should include <strong>+cu130</strong> and <strong>torch.cuda.is_available()</strong> should print <strong>True</strong>.
        </p>
      </>
    )
  }

  if (mode === 'amd') {
    return (
      <>
        <CopyableCodeBlock
          label="Step C: Create Python 3.12 Environment"
          command="conda create -n nam python=3.12 -y && conda activate nam"
        />
        <CopyableCodeBlock
          label="Step D: Install ROCm SDK Core"
          command="pip install --no-cache-dir https://repo.radeon.com/rocm/windows/rocm-rel-7.2/rocm_sdk_core-7.2.0.dev0-py3-none-win_amd64.whl"
        />
        <CopyableCodeBlock
          label="Step E: Install ROCm PyTorch"
          command="pip install --no-cache-dir https://repo.radeon.com/rocm/windows/rocm-rel-7.2/torch-2.9.1%2Brocmsdk20260116-cp312-cp312-win_amd64.whl"
        />
        <CopyableCodeBlock
          label="Step F: Verify ROCm PyTorch"
          command={'python -c "import torch; print(\'CUDA Available:\', torch.cuda.is_available()); print(\'HIP Version:\', torch.version.hip)"'}
        />
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          Expected result: <strong>CUDA Available: True</strong> and <strong>HIP Version:</strong> shows a version string. Note: torch.version.cuda will be None for ROCm builds.
        </p>
        <CopyableCodeBlock
          label="Step G: Install Neural Amp Modeler"
          command={'pip install --upgrade "neural-amp-modeler>=0.13.0"'}
        />
      </>
    )
  }

  return (
    <>
      <CopyableCodeBlock
        label="Step C: Install PyTorch"
        command="pip install torch"
      />
      {mode === 'apple' && (
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          On Apple Silicon, NAM-BOT will later check whether PyTorch can use MPS on your machine.
        </p>
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
              If you already have Neural Amp Modeler working on this machine, you probably do not need to rebuild your environment.
              In that case, NAM-BOT mainly needs the correct backend settings so it can point at the same Conda environment you already use for NAM training.
            </p>
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              Security note: NAM-BOT checks package metadata before importing NAM or Lightning and blocks Lightning <strong>2.6.2</strong> and <strong>2.6.3</strong>, which were compromised PyPI releases. Use <strong>neural-amp-modeler 0.13.0 or newer</strong> for fresh installs and A2 local training.
            </p>

            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
                <strong>Use this path if:</strong> you can already run NAM training from its built-in GUI or from your existing terminal workflow and just want NAM-BOT to use that same environment.
              </p>
            </div>

            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
                <strong>macOS note:</strong> use <strong>Terminal</strong> instead of Command Prompt or PowerShell, expect the Conda command to be <code style={{ color: 'var(--neon-cyan)' }}>conda</code>, and on Apple Silicon the accelerator path is <strong>MPS</strong> rather than CUDA.
              </p>
            </div>

            <h3 className="guide-step-title">
              1. Open Settings
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Go to <strong>Settings</strong> in the left menu</li>
              <li>Set the Conda executable path if your setup does not use the default executable shown in Settings</li>
              <li>Set the backend mode to match how you launch NAM today</li>
              <li>Enter the Conda environment name or environment path that already contains your working NAM install</li>
            </ol>

            <h3 className="guide-step-title">
              2. Save Settings
            </h3>
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
              Settings save automatically after a short pause, or you can click <strong>Save Settings</strong>. Then open <strong>Diagnostics</strong> to check the environment you selected; use <strong>Re-check All</strong> to refresh existing results.
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
            </ol>

            <h3 className="guide-step-title">
              4. Start Using NAM-BOT
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Jobs</strong></li>
              <li>Click <strong>+ New Job</strong></li>
              <li>Select your audio and output files</li>
              <li>Save the job, then queue it</li>
            </ol>
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

            <h3 className="guide-step-title">
              1. Install Miniconda
            </h3>
            <p style={{ color: 'var(--text-steel)', marginBottom: '8px' }}>
              Navigate to: <a href="https://www.anaconda.com/download" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)' }}>https://www.anaconda.com/download</a>
            </p>
            <p style={{ color: 'var(--text-steel)' }}>
              Install Miniconda and make sure <code style={{ color: 'var(--neon-cyan)' }}>conda</code> is added to your PATH.
            </p>
            <div style={{
              backgroundColor: 'rgba(0, 243, 255, 0.05)',
              padding: '12px',
              borderLeft: '4px solid var(--neon-cyan)',
              marginBottom: '16px'
            }}>
              <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
                <strong>Important:</strong> Scroll to the bottom of the Anaconda download page to find the <strong>Miniconda</strong> installers.
                If prompted, allow Miniconda to add itself to PATH.
              </p>
            </div>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', marginTop: '-4px', marginBottom: '16px' }}>
              On Apple Silicon, choose the Apple Silicon installer. On macOS builds, you may need to right-click the app and choose <strong>Open</strong> on first launch if Gatekeeper warns about an unsigned app.
            </p>

            {guideMode !== 'amd' && (
              <>
                <h3 className="guide-step-title">
                  2. Create NAM Environment
                </h3>
                <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
                  Open Terminal on macOS, or Command Prompt / PowerShell on Windows, and run these commands <strong>one at a time</strong>:
                </p>

                <CopyableCodeBlock
                  label="Step A: Create Environment"
                  command="conda create -n nam python=3.11 -y"
                />
                <CopyableCodeBlock
                  label="Step B: Activate"
                  command="conda activate nam"
                />
              </>
            )}

            <h3 className="guide-step-title">
              3. Install PyTorch for This Machine
            </h3>
            {renderTorchInstall(guideMode)}

            {guideMode !== 'amd' && (
              <CopyableCodeBlock
                label={guideMode === 'nvidia' ? 'Step F: Install Neural Amp Modeler' : 'Step D: Install Neural Amp Modeler'}
                command={'pip install --upgrade "neural-amp-modeler>=0.13.0"'}
              />
            )}

            <h3 className="guide-step-title">
              4. Configure NAM-BOT
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Settings</strong></li>
              <li>Leave the default Conda executable unchanged unless your install needs a custom path</li>
              <li>Leave the default environment name as <code style={{ color: 'var(--neon-cyan)' }}>nam</code> unless you intentionally created a different environment</li>
              <li>Choose an output directory</li>
              <li>Click <strong>Save Settings</strong></li>
            </ol>

            <h3 className="guide-step-title">
              5. Validate
            </h3>
            <p style={{ color: 'var(--text-steel)' }}>
              NAM-BOT validates the selected setup automatically on startup. You can always go to <strong>Diagnostics</strong> and click <strong>Re-check All</strong> to inspect backend readiness, Training Launch readiness, GPU visibility, and NAM version detection together.
            </p>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', marginTop: '8px' }}>
              On Windows, GPU diagnostics check for both NVIDIA CUDA and AMD ROCm GPUs. On Apple Silicon, the same screen also reports whether PyTorch can see <strong>MPS</strong>.
            </p>

            <h3 className="guide-step-title">
              6. Create a Job
            </h3>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
              <li>Go to <strong>Jobs</strong></li>
              <li>Click <strong>+ New Job</strong></li>
              <li>Select input and output audio files</li>
              <li>Adjust training settings</li>
              <li>Click <strong>Save Job</strong>, then <strong>Queue</strong></li>
            </ol>
          </div>
        </PropertySection>

        <PropertySection id="guide-links" title="Links">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href="https://github.com/sdatkinson/neural-amp-modeler" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              NAM GitHub
            </a>
            <a href="https://www.anaconda.com/download" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Anaconda / Miniconda
            </a>
            <a href="https://pytorch.org/get-started/locally/" target="_blank" rel="noopener noreferrer" className="btn btn-green">
              PyTorch Install Guide
            </a>
          </div>
        </PropertySection>
      </div>
    </PropertySheet>
  )
}
