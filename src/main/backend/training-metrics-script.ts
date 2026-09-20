// Run the installed nam-full entry point with metrics and user-requested controls.
// The installed package and existing checkpoint callbacks stay untouched.
import { buildConvergenceScript } from './convergence-script'
export const TRAINING_METRICS_FILENAME = 'esr-history.jsonl'

export function buildTrainingMetricsScript(): string {
  return String.raw`
import json
import math
import re
import sys
import time
from copy import deepcopy
from datetime import datetime, timezone
from importlib.metadata import distribution
from pathlib import Path

${buildConvergenceScript()}

def install_esr_callback():
    from nam.train import full
    import pytorch_lightning as pl

    with open(sys.argv[2], encoding="utf-8") as source:
        model_config = json.load(source)
    packed = model_config.get("net", {}).get("name") == "PackedWaveNet"
    submodels = model_config.get("net", {}).get("config", {}).get("submodels", [])
    history_path = Path(__file__).with_name("esr-history.jsonl")
    original_create_callbacks = full._create_callbacks
    control_dir = Path(__file__).with_name("training-controls")
    policy_path = Path(__file__).with_name("stopping-policy.json")
    policy = json.loads(policy_path.read_text(encoding="utf-8")) if policy_path.exists() else {"mode": "fixed", "level": "balanced", "maxEpochs": None}
    expected_models = {index: model.get("name", "Model " + str(index + 1)) for index, model in enumerate(submodels)} if packed else {None: "Model"}

    def write_result(path, value):
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, allow_nan=False), encoding="utf-8")
        temporary.replace(path)

    class EsrHistoryCallback(pl.Callback):
        def __init__(self):
            self.disabled = False
            self.last_control_check = 0.0
            self.monitor = None
            self.pending_record = None
            self.last_completed_epoch = 0
            self.finishing = False

        def publish_convergence(self):
            if self.monitor is not None:
                write_result(control_dir / "convergence.json", self.monitor.status())

        def on_fit_start(self, trainer, pl_module):
            original_limit = trainer.max_epochs if trainer.max_epochs is not None and trainer.max_epochs > 0 else None
            self.monitor = ConvergenceMonitor(expected_models, policy, original_limit)
            if trainer.is_global_zero:
                try:
                    control_dir.mkdir(exist_ok=True)
                    self.publish_convergence()
                    write_result(control_dir / "ready.json", {"ready": True, "stoppingPolicy": CONVERGENCE_VERSION})
                except Exception as error:
                    print("NAM-BOT: live export controls unavailable: " + str(error), flush=True)
                    if policy["mode"] == "convergence":
                        raise RuntimeError("Cannot start convergence mode without its monitoring controls") from error

        def on_train_batch_end(self, trainer, pl_module, outputs, batch, batch_idx):
            self.handle_command(trainer, pl_module)
            self.sync_live_limits(trainer)

        def sync_live_limits(self, trainer):
            if trainer.world_size > 1:
                trainer.fit_loop.max_epochs, trainer.should_stop = trainer.strategy.broadcast(
                    (trainer.fit_loop.max_epochs, trainer.should_stop), src=0)

        def on_train_epoch_end(self, trainer, pl_module):
            self.last_completed_epoch = int(trainer.current_epoch) + 1
            self.handle_command(trainer, pl_module, force=True)
            self.sync_live_limits(trainer)
            wants_stop = False
            if trainer.is_global_zero and self.monitor is not None:
                try:
                    record = self.pending_record
                    self.pending_record = None
                    if record is not None and record["epoch"] == self.last_completed_epoch:
                        wants_stop = self.monitor.observe(record["epoch"], record["models"])
                    if wants_stop:
                        callback = next((item for item in trainer.callbacks if hasattr(item, "checkpoint_paths")), None)
                        paths = callback.checkpoint_paths if packed and callback is not None else [trainer.checkpoint_callback.best_model_path]
                        wants_stop = bool(paths) and all(paths) and (not packed or len(paths) == len(submodels))
                        wants_stop = wants_stop and self.last_completed_epoch >= (trainer.min_epochs or 0) and trainer.global_step >= (trainer.min_steps or 0)
                        if wants_stop:
                            self.monitor.finish("convergence")
                    self.publish_convergence()
                except Exception as error:
                    if wants_stop:
                        self.monitor.reason = None
                    wants_stop = False
                    self.monitor.unavailable("Convergence monitoring unavailable: " + str(error))
                    print("NAM-BOT: " + self.monitor.message, flush=True)
                    try:
                        self.publish_convergence()
                    except Exception:
                        pass
            # All ranks participate, even though only rank zero records ESR and policy.
            if trainer.strategy.reduce_boolean_decision(wants_stop, all=False):
                trainer.should_stop = True

        def on_train_end(self, trainer, pl_module):
            self.finishing = True
            self.handle_command(trainer, pl_module, force=True)
            if not trainer.is_global_zero:
                return
            if self.monitor is not None:
                self.monitor.epoch = max(self.monitor.epoch, self.last_completed_epoch)
                if self.monitor.reason is None:
                    limit = self.monitor.limit()
                    reason = ("epoch_limit" if self.monitor.policy["mode"] == "fixed" else "safety_cap") if limit is not None and self.last_completed_epoch >= limit else "trainer"
                    self.monitor.finish(reason)
                self.monitor.phase = "finished"
                try:
                    self.publish_convergence()
                except Exception as error:
                    print("NAM-BOT: final convergence status unavailable: " + str(error), flush=True)
            try:
                callback = next((item for item in trainer.callbacks if hasattr(item, "checkpoint_paths")), None)
                selected = callback.checkpoint_paths if packed and callback is not None else [trainer.checkpoint_callback.best_model_path]
                if selected and all(selected):
                    write_result(Path(__file__).with_name("final-report-evidence.json"), self.report_evidence(selected))
            except Exception as error:
                print("NAM-BOT: final report statistics unavailable: " + str(error), flush=True)

        def handle_command(self, trainer, pl_module, force=False):
            try:
                self._handle_command(trainer, pl_module, force)
            except Exception as error:
                print("NAM-BOT: training command failed: " + str(error), flush=True)

        def _handle_command(self, trainer, pl_module, force):
            if trainer.sanity_checking or not trainer.is_global_zero:
                return
            now = time.monotonic()
            if not force and now - self.last_control_check < 0.25:
                return
            self.last_control_check = now
            request_path = control_dir / "request.json"
            if not request_path.exists():
                return
            request = json.loads(request_path.read_text(encoding="utf-8"))
            request_path.unlink()
            request_id = request.get("id", "")
            if not re.fullmatch(r"[0-9a-f-]{36}", request_id):
                return
            response_path = control_dir / (request_id + ".json")
            try:
                if request.get("expiresAt", 0) < time.time():
                    raise RuntimeError("The training command expired. Please try again.")
                action = request.get("action")
                if action == "set_stopping_policy":
                    if self.monitor is None or trainer.should_stop or self.finishing:
                        raise RuntimeError("Training is already finishing or does not support live mode changes")
                    previous_monitor = deepcopy(self.monitor)
                    previous_limit = trainer.fit_loop.max_epochs
                    try:
                        self.monitor.set_policy(request.get("policy"), int(trainer.current_epoch) + 1)
                        limit = self.monitor.limit()
                        trainer.fit_loop.max_epochs = -1 if limit is None else limit
                        self.publish_convergence()
                        write_result(response_path, {"ok": True, "epoch": int(trainer.current_epoch) + 1,
                            "convergence": self.monitor.status()})
                    except Exception:
                        self.monitor = previous_monitor
                        trainer.fit_loop.max_epochs = previous_limit
                        self.publish_convergence()
                        raise
                    return
                if action == "finish":
                    if self.monitor is not None:
                        self.monitor.finish("manual")
                        self.publish_convergence()
                    trainer.should_stop = True
                    write_result(response_path, {"ok": True, "epoch": int(trainer.current_epoch) + 1})
                    return
                if action != "export":
                    raise RuntimeError("Unknown training command")
                import torch
                paths = None
                if packed:
                    best_callback = next((callback for callback in trainer.callbacks
                                          if hasattr(callback, "checkpoint_paths")), None)
                    paths = None if best_callback is None else best_callback.checkpoint_paths
                    if paths is None or len(paths) != len(submodels) or not all(paths):
                        raise RuntimeError("Wait for a validated checkpoint for every embedded model.")
                    checkpoint = paths[-1]
                else:
                    checkpoint = trainer.checkpoint_callback.best_model_path
                if not checkpoint:
                    raise RuntimeError("Wait for the first validated checkpoint before exporting.")
                outdir = control_dir / request_id
                outdir.mkdir(exist_ok=True)
                # Preserve training RNG and never move or replace the live network.
                with torch.random.fork_rng(devices=[]):
                    snapshot = type(pl_module).load_from_checkpoint(
                        checkpoint, map_location="cpu", **type(pl_module).parse_config(model_config))
                    snapshot.cpu()
                    snapshot.eval()
                    snapshot.net.sample_rate = pl_module.net.sample_rate
                    # Carry over normalization compensation without modifying datasets.
                    snapshot.net.export_model_dict_post_hooks[:] = deepcopy(pl_module.net.export_model_dict_post_hooks)
                    if packed:
                        snapshot.net.export_container(outdir, checkpoint_paths_by_submodel=paths)
                    else:
                        snapshot.net.export(outdir)
                evidence = None
                report_warning = None
                try:
                    evidence = self.report_evidence(paths if packed else [checkpoint])
                except Exception as error:
                    report_warning = "Export-time report statistics unavailable: " + str(error)
                write_result(response_path, {"ok": True, "epoch": int(trainer.current_epoch) + 1,
                    "reportEvidence": evidence, "reportWarning": report_warning})
            except Exception as error:
                write_result(response_path, {"ok": False, "error": str(error)})

        def report_evidence(self, selected_paths):
            import torch
            history = []
            if history_path.exists():
                for line in history_path.read_text(encoding="utf-8").splitlines():
                    try:
                        history.append(json.loads(line))
                    except (ValueError, TypeError):
                        pass
            metrics = []
            for index, selected_path in enumerate(selected_paths):
                packed_entry = None
                metadata_path = Path(selected_path).parent / "packed_best.json"
                if packed and metadata_path.exists():
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    packed_entry = next((entry for entry in metadata.get("submodels", [])
                        if entry.get("submodel_index") == index
                        and Path(entry.get("checkpoint_path", "")).resolve() == Path(selected_path).resolve()), None)
                if packed_entry is not None:
                    epoch = int(packed_entry["epoch"]) + 1
                    step = int(packed_entry["step"])
                else:
                    checkpoint_data = torch.load(selected_path, map_location="cpu", weights_only=False)
                    epoch = int(checkpoint_data["epoch"]) + 1
                    step = int(checkpoint_data.get("global_step", -1))
                record = next((item for item in reversed(history)
                    if item.get("epoch") == epoch and item.get("step") == step), None)
                measurement = next((item for item in (record or {}).get("models", [])
                    if item.get("submodelIndex") == (index if packed else None)), None)
                esr = None if measurement is None else measurement.get("esr")
                if esr is None and packed_entry is not None and model_config.get("loss", {}).get("val_loss", "esr") == "esr":
                    esr = packed_entry.get("best_metric")
                if esr is not None and (not math.isfinite(esr) or esr < 0):
                    esr = None
                metrics.append({"submodelIndex": index if packed else None,
                    "submodelName": submodels[index].get("name") if packed else None,
                    "epoch": epoch, "esr": esr})
            return {"capturedAt": datetime.now(timezone.utc).isoformat(), "history": history, "metrics": metrics,
                "convergence": self.monitor.status() if self.monitor is not None else None}

        def on_validation_end(self, trainer, pl_module):
            if self.disabled or trainer.sanity_checking or not trainer.is_global_zero:
                return
            try:
                metrics = trainer.callback_metrics
                models = []
                for key, tensor in metrics.items():
                    if packed:
                        if not key.startswith("ESR_packed_") or not key[11:].isdigit():
                            continue
                        index = int(key[11:])
                        name = submodels[index].get("name") if index < len(submodels) else None
                    else:
                        if key != "ESR":
                            continue
                        index, name = None, None
                    value = float(tensor.detach().cpu().item()) if hasattr(tensor, "detach") else float(tensor)
                    if math.isfinite(value) and value >= 0:
                        models.append({"submodelIndex": index, "submodelName": name, "esr": value})
                models.sort(key=lambda model: model["submodelIndex"] or 0)
                record = {"epoch": int(trainer.current_epoch) + 1,
                          "step": int(trainer.global_step), "models": models}
                self.pending_record = record
                if not models:
                    return
                with history_path.open("a", encoding="utf-8") as output:
                    output.write(json.dumps(record, allow_nan=False) + "\n")
            except Exception as error:
                self.disabled = True
                self.pending_record = None
                if self.monitor is not None:
                    self.monitor.unavailable("Validation ESR unavailable: " + str(error))
                    try:
                        self.publish_convergence()
                    except Exception:
                        pass
                print("NAM-BOT: ESR history unavailable: " + str(error), flush=True)

    def create_callbacks(*args, **kwargs):
        return [*original_create_callbacks(*args, **kwargs), EsrHistoryCallback()]

    full._create_callbacks = create_callbacks


def main():
    try:
        install_esr_callback()
    except Exception as error:
        print("NAM-BOT: ESR history unavailable: " + str(error), flush=True)
        policy_path = Path(__file__).with_name("stopping-policy.json")
        if policy_path.exists() and json.loads(policy_path.read_text(encoding="utf-8")).get("mode") == "convergence":
            raise RuntimeError("Cannot start convergence mode without ESR monitoring") from error
    entry = next(entry for entry in distribution("neural-amp-modeler").entry_points
                 if entry.group == "console_scripts" and entry.name == "nam-full")
    sys.argv[0] = "nam-full"
    return entry.load()()


if __name__ == "__main__":
    sys.exit(main())
`
}
