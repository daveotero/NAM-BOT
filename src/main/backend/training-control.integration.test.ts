import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, it } from 'vitest'
import { buildTrainingMetricsScript } from './training-metrics-script'

// Opt-in real NAM smoke test. Set NAM_BOT_SMOKE_PYTHON to the environment's Python.
const python = process.env.NAM_BOT_SMOKE_PYTHON

it.skipIf(!python)('exports packed best weights without mutating training, then finishes early', () => {
  if (!python) return
  const directory = mkdtempSync(join(tmpdir(), 'nam-training-control-'))
  try {
    writeFileSync(join(directory, 'launcher.py'), buildTrainingMetricsScript())
    const output = execFileSync(python, ['-c', String.raw`
import json, runpy, sys, time, uuid
from copy import deepcopy
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
import pytorch_lightning as pl
from nam.train import full

root = Path(sys.argv[1])
signal = np.random.default_rng(42).normal(0, 0.04, 8192).astype(np.float32)
sf.write(root / "input.wav", signal, 48000, subtype="FLOAT")
sf.write(root / "output.wav", np.tanh(signal * 1.5), 48000, subtype="FLOAT")
data = {"common": {"x_path": str(root / "input.wav"), "y_path": str(root / "output.wav"), "delay": 0,
                   "require_input_pre_silence": None, "y_scale": 2.0},
        "train": {"start_samples": 0, "stop_samples": 4096, "ny": 256},
        "validation": {"start_samples": 4096, "stop_samples": 8192, "ny": None}}
def submodel(channels):
    return {"name": f"channels_{channels}", "config": {"layers_configs": [{"input_size": 1, "condition_size": 1,
        "channels": channels, "kernel_size": 3, "dilations": [1, 2], "activation": "Tanh", "gated": False,
        "head": {"out_channels": 1, "kernel_size": 1, "bias": True}}], "head_scale": 0.01}}
model = {"net": {"name": "PackedWaveNet", "config": {"submodels": [submodel(3), submodel(8)]}},
         "loss": {"val_loss": "esr"}, "optimizer": {"lr": 0.004}, "lr_scheduler": None}
learning = {"train_dataloader": {"batch_size": 2, "num_workers": 0}, "val_dataloader": {},
            "trainer": {"max_epochs": 8, "accelerator": "cpu", "devices": 1, "logger": False,
                        "limit_train_batches": 2, "limit_val_batches": 1, "enable_progress_bar": False}, "trainer_fit_kwargs": {}}
(root / "model.json").write_text(json.dumps(model))
sys.argv = [str(root / "launcher.py"), "data.json", str(root / "model.json"), "learning.json", str(root / "out")]
scope = runpy.run_path(str(root / "launcher.py"), run_name="integration_test")
base_callbacks = full._create_callbacks
exported_path = None
exported_epoch = None

def command(trainer, module, action):
    callback = next(callback for callback in trainer.callbacks if hasattr(callback, "handle_command"))
    request_id = str(uuid.uuid4())
    controls = root / "training-controls"
    (controls / "request.json").write_text(json.dumps({"id": request_id, "action": action, "expiresAt": time.time() + 120}))
    callback.handle_command(trainer, module, force=True)
    result = json.loads((controls / (request_id + ".json")).read_text())
    assert result["ok"], result
    return controls / request_id / "model.nam"

class ExerciseControls(pl.Callback):
    def on_train_epoch_start(self, trainer, module):
        global exported_path, exported_epoch
        if trainer.current_epoch == 1:
            before_rng = torch.get_rng_state().clone()
            before_weights = {key: value.clone() for key, value in module.state_dict().items()}
            before_optimizer = deepcopy(trainer.optimizers[0].state_dict())
            assert module.training
            exported_path = command(trainer, module, "export")
            exported_epoch = trainer.current_epoch
            assert module.training and module.net.training
            assert torch.equal(before_rng, torch.get_rng_state()), "Export perturbed the training RNG"
            assert all(torch.equal(value, module.state_dict()[key]) for key, value in before_weights.items())
            after_optimizer = trainer.optimizers[0].state_dict()
            for key, state in before_optimizer["state"].items():
                for name, value in state.items():
                    other = after_optimizer["state"][key][name]
                    assert torch.equal(value, other) if torch.is_tensor(value) else value == other
            exported = json.loads(exported_path.read_text())
            assert exported["architecture"] == "SlimmableContainer"
            assert len(exported["config"]["submodels"]) == 2
            assert exported["sample_rate"] == 48000
            # NAM's normal final export at the first epoch is the reference for
            # best-checkpoint extraction AND data-normalization compensation.
            expected = json.loads((root / "reference" / "model.nam").read_text())
            for actual_sub, expected_sub in zip(exported["config"]["submodels"], expected["config"]["submodels"]):
                assert actual_sub["model"]["config"] == expected_sub["model"]["config"]
                assert actual_sub["model"]["weights"] == expected_sub["model"]["weights"]
            assert not trainer.should_stop
        if trainer.current_epoch == 2:
            assert exported_path is not None and trainer.current_epoch > exported_epoch
            command(trainer, module, "finish")
            assert trainer.should_stop

# Establish NAM's own one-epoch export as an independent reference.
(root / "reference").mkdir()
reference_learning = deepcopy(learning)
reference_learning["trainer"]["max_epochs"] = 1
torch.manual_seed(123)
full.main(deepcopy(data), deepcopy(model), reference_learning, root / "reference", no_show=True, make_plots=False)
full._create_callbacks = lambda *args, **kwargs: [*base_callbacks(*args, **kwargs), ExerciseControls()]
scope["install_esr_callback"]()
(root / "out").mkdir()
torch.manual_seed(123)
full.main(deepcopy(data), deepcopy(model), learning, root / "out", no_show=True, make_plots=False)
history = [json.loads(line) for line in (root / "esr-history.jsonl").read_text().splitlines()]
assert 2 <= len(history) < 8, history
assert exported_path is not None and exported_path.exists()
assert (root / "out" / "model.nam").exists()
print("LIVE_EXPORT_AND_FINISH_PASSED")
`, directory], { encoding: 'utf8', timeout: 150_000 })
    expect(output).toContain('LIVE_EXPORT_AND_FINISH_PASSED')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 160_000)
