// Run the installed nam-full entry point with metrics and user-requested controls.
// The installed package and existing checkpoint callbacks stay untouched.
export const TRAINING_METRICS_FILENAME = 'esr-history.jsonl'

export function buildTrainingMetricsScript(): string {
  return String.raw`
import json
import math
import re
import sys
import time
from copy import deepcopy
from importlib.metadata import distribution
from pathlib import Path


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

    def write_result(path, value):
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, allow_nan=False), encoding="utf-8")
        temporary.replace(path)

    class EsrHistoryCallback(pl.Callback):
        def __init__(self):
            self.disabled = False
            self.last_control_check = 0.0

        def on_fit_start(self, trainer, pl_module):
            if trainer.is_global_zero:
                try:
                    control_dir.mkdir(exist_ok=True)
                    write_result(control_dir / "ready.json", {"ready": True})
                except Exception as error:
                    print("NAM-BOT: live export controls unavailable: " + str(error), flush=True)

        def on_train_batch_end(self, trainer, pl_module, outputs, batch, batch_idx):
            self.handle_command(trainer, pl_module)

        def on_train_end(self, trainer, pl_module):
            self.handle_command(trainer, pl_module, force=True)

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
                if action == "finish":
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
                write_result(response_path, {"ok": True, "epoch": int(trainer.current_epoch) + 1})
            except Exception as error:
                write_result(response_path, {"ok": False, "error": str(error)})

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
                if not models:
                    return
                models.sort(key=lambda model: model["submodelIndex"] or 0)
                record = {"epoch": int(trainer.current_epoch) + 1,
                          "step": int(trainer.global_step), "models": models}
                with history_path.open("a", encoding="utf-8") as output:
                    output.write(json.dumps(record, allow_nan=False) + "\n")
            except Exception as error:
                self.disabled = True
                print("NAM-BOT: ESR history unavailable: " + str(error), flush=True)

    def create_callbacks(*args, **kwargs):
        return [*original_create_callbacks(*args, **kwargs), EsrHistoryCallback()]

    full._create_callbacks = create_callbacks


def main():
    try:
        install_esr_callback()
    except Exception as error:
        print("NAM-BOT: ESR history unavailable: " + str(error), flush=True)
    entry = next(entry for entry in distribution("neural-amp-modeler").entry_points
                 if entry.group == "console_scripts" and entry.name == "nam-full")
    sys.argv[0] = "nam-full"
    return entry.load()()


if __name__ == "__main__":
    sys.exit(main())
`
}
