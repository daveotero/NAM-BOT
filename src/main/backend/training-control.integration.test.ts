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
    if action == "export":
        assert result.get("reportWarning") is None, result
        evidence = result["reportEvidence"]
        assert len(evidence["metrics"]) == 2
        assert len(evidence["history"]) == 1
        for metric in evidence["metrics"]:
            assert metric["epoch"] == 1
            measured = next(item["esr"] for item in evidence["history"][0]["models"]
                            if item["submodelIndex"] == metric["submodelIndex"])
            assert abs(metric["esr"] - measured) < 1e-12
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
final_evidence = json.loads((root / "final-report-evidence.json").read_text())
assert len(final_evidence["history"]) == len(history)
assert all(metric["esr"] is not None for metric in final_evidence["metrics"])
assert exported_path is not None and exported_path.exists()
assert (root / "out" / "model.nam").exists()
print("LIVE_EXPORT_AND_FINISH_PASSED")

# Real Lightning loop: replace a two-epoch target while it is running, then
# automatically export at Fast convergence using the unmodified production rules.
launcher_source = (root / "launcher.py").read_text()
auto_root = root / "auto"
auto_root.mkdir()
root = auto_root
(root / "launcher.py").write_text(launcher_source)
auto_model = deepcopy(model)
auto_model["optimizer"]["lr"] = 0.0  # Constant validation, deterministic plateau.
(root / "model.json").write_text(json.dumps(auto_model))
sys.argv = [str(root / "launcher.py"), "data.json", str(root / "model.json"), "learning.json", str(root / "out")]

class EnableConvergence(pl.Callback):
    def on_train_epoch_start(self, trainer, module):
        if trainer.current_epoch != 1:
            return
        callback = next(item for item in trainer.callbacks if hasattr(item, "handle_command"))
        request_id = str(uuid.uuid4())
        controls = root / "training-controls"
        (controls / "request.json").write_text(json.dumps({"id": request_id, "action": "set_stopping_policy",
            "expiresAt": time.time() + 120, "policy": {"mode": "convergence", "level": "fast", "maxEpochs": None}}))
        callback.handle_command(trainer, module, force=True)
        response = json.loads((controls / (request_id + ".json")).read_text())
        assert response["ok"] and response["convergence"]["originalEpochLimit"] == 2, response
        assert trainer.max_epochs == -1

full._create_callbacks = lambda *args, **kwargs: [*base_callbacks(*args, **kwargs), EnableConvergence()]
auto_scope = runpy.run_path(str(root / "launcher.py"), run_name="convergence_integration_test")
auto_scope["install_esr_callback"]()
auto_learning = deepcopy(learning)
auto_learning["trainer"]["max_epochs"] = 2
auto_learning["trainer"]["enable_model_summary"] = False
(root / "out").mkdir()
torch.manual_seed(123)
full.main(deepcopy(data), auto_model, auto_learning, root / "out", no_show=True, make_plots=False)
auto_history = [json.loads(line) for line in (root / "esr-history.jsonl").read_text().splitlines()]
assert len(auto_history) == 104, len(auto_history)
status = json.loads((root / "training-controls" / "convergence.json").read_text())
assert status["phase"] == "finished" and status["completionReason"] == "convergence", status
assert status["achievedLevel"] == "fast" and status["originalEpochLimit"] == 2
auto_evidence = json.loads((root / "final-report-evidence.json").read_text())
assert auto_evidence["convergence"] == status
assert all(metric["epoch"] == 1 for metric in auto_evidence["metrics"])
saved = json.loads((root / "out" / "model.nam").read_text())
assert saved["architecture"] == "SlimmableContainer" and len(saved["config"]["submodels"]) == 2
print("LIVE_LIMIT_REMOVAL_AND_CONVERGENCE_PASSED")

# Exercise caps, restoring an already-passed target, and a failed status write
# at the auto-stop boundary. Each case uses an isolated real CPU trainer.
for scenario, expected_epochs, expected_reason in [("cap", 3, "safety_cap"), ("restore", 4, "epoch_limit"), ("status_failure", 159, "convergence")]:
    root = auto_root.parent / scenario
    root.mkdir()
    (root / "launcher.py").write_text(launcher_source)
    (root / "model.json").write_text(json.dumps(auto_model))
    if scenario != "restore":
        (root / "stopping-policy.json").write_text(json.dumps({"mode": "convergence", "level": "fast", "maxEpochs": 3 if scenario == "cap" else None}))
    sys.argv = [str(root / "launcher.py"), "data.json", str(root / "model.json"), "learning.json", str(root / "out")]

    def set_policy(trainer, module, mode):
        callback = next(item for item in trainer.callbacks if hasattr(item, "handle_command"))
        request_id = str(uuid.uuid4())
        controls = root / "training-controls"
        (controls / "request.json").write_text(json.dumps({"id": request_id, "action": "set_stopping_policy",
            "expiresAt": time.time() + 120, "policy": {"mode": mode, "level": "fast", "maxEpochs": None}}))
        callback.handle_command(trainer, module, force=True)
        return json.loads((controls / (request_id + ".json")).read_text())

    class ExercisePolicyBoundaries(pl.Callback):
        def on_fit_start(self, trainer, module):
            if scenario == "status_failure":
                callback = next(item for item in trainer.callbacks if hasattr(item, "handle_command"))
                publish = callback.publish_convergence
                self.failed_once = False
                def unreliable_publish():
                    if callback.monitor.reason == "convergence" and not self.failed_once:
                        self.failed_once = True
                        raise OSError("Simulated status write failure")
                    publish()
                callback.publish_convergence = unreliable_publish

        def on_train_epoch_start(self, trainer, module):
            if scenario == "cap" and trainer.current_epoch == 1:
                assert not set_policy(trainer, module, "fixed")["ok"]
                assert trainer.max_epochs == 3
            if scenario == "restore":
                if trainer.current_epoch == 1:
                    assert set_policy(trainer, module, "convergence")["ok"]
                    assert trainer.max_epochs == -1
                if trainer.current_epoch == 3:
                    assert set_policy(trainer, module, "fixed")["ok"]
                    assert trainer.max_epochs == 2

    full._create_callbacks = lambda *args, **kwargs: [*base_callbacks(*args, **kwargs), ExercisePolicyBoundaries()]
    boundary_scope = runpy.run_path(str(root / "launcher.py"), run_name="boundary_integration_test")
    boundary_scope["install_esr_callback"]()
    boundary_learning = deepcopy(auto_learning)
    boundary_learning["trainer"]["max_epochs"] = 3 if scenario == "cap" else 2 if scenario == "restore" else -1
    (root / "out").mkdir()
    full.main(deepcopy(data), deepcopy(auto_model), boundary_learning, root / "out", no_show=True, make_plots=False)
    boundary_history = (root / "esr-history.jsonl").read_text().splitlines()
    boundary_status = json.loads((root / "training-controls" / "convergence.json").read_text())
    assert len(boundary_history) == expected_epochs, (scenario, len(boundary_history))
    assert boundary_status["completionReason"] == expected_reason, boundary_status
    assert boundary_status["epoch"] == expected_epochs, boundary_status
    assert (root / "out" / "model.nam").exists()
print("POLICY_BOUNDARIES_AND_MONITOR_RECOVERY_PASSED")
`, directory], { encoding: 'utf8', timeout: 150_000 })
    expect(output).toContain('LIVE_EXPORT_AND_FINISH_PASSED')
    expect(output).toContain('LIVE_LIMIT_REMOVAL_AND_CONVERGENCE_PASSED')
    expect(output).toContain('POLICY_BOUNDARIES_AND_MONITOR_RECOVERY_PASSED')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 160_000)
