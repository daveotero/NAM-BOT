// Run the installed nam-full entry point with one additional, read-only callback.
// The installed NAM package and its training/checkpoint callbacks stay untouched.
export const TRAINING_METRICS_FILENAME = 'esr-history.jsonl'

export function buildTrainingMetricsScript(): string {
  return String.raw`
import json
import math
import sys
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

    class EsrHistoryCallback(pl.Callback):
        def __init__(self):
            self.disabled = False

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
