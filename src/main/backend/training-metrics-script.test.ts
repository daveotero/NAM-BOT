import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildTrainingMetricsScript, TRAINING_METRICS_FILENAME } from './training-metrics-script'

const pythonAvailable = spawnSync('python', ['--version']).status === 0

describe('training metrics Python callback', () => {
  it.skipIf(!pythonAvailable)('records validation metrics without changing existing callbacks or including sanity checks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nam-metrics-callback-'))
    try {
      const scriptPath = join(directory, 'train-with-metrics.py')
      const configPath = join(directory, 'model.json')
      writeFileSync(scriptPath, buildTrainingMetricsScript())
      writeFileSync(configPath, JSON.stringify({ net: { name: 'PackedWaveNet', config: { submodels: [
        { name: 'channels_8' }, { name: 'channels_20' }
      ] } } }))
      const result = spawnSync('python', ['-c', String.raw`
import json, runpy, sys, types
from pathlib import Path
script, config = sys.argv[1:]
sys.argv = [script, "data.json", config, "learning.json", "output"]
nam = types.ModuleType("nam")
train = types.ModuleType("nam.train")
full = types.ModuleType("nam.train.full")
pl = types.ModuleType("pytorch_lightning")
pl.Callback = type("Callback", (), {})
sentinel = object()
full._create_callbacks = lambda *args, **kwargs: [sentinel]
nam.train, train.full = train, full
sys.modules.update({"nam": nam, "nam.train": train, "nam.train.full": full, "pytorch_lightning": pl})
scope = runpy.run_path(script, run_name="callback_test")
scope["install_esr_callback"]()
callbacks = full._create_callbacks({}, packed=True)
assert callbacks[0] is sentinel and len(callbacks) == 2
callback = callbacks[1]
trainer = types.SimpleNamespace(sanity_checking=True, is_global_zero=True,
    current_epoch=0, global_step=10,
    callback_metrics={"ESR": 0.5, "ESR_packed_0": 0.0064, "ESR_packed_1": 0.000951,
                      "val_loss_packed_0": 999, "ESR_packed_bad": 1})
path = Path(script).with_name("esr-history.jsonl")
callback.on_validation_end(trainer, None)
assert not path.exists()
trainer.sanity_checking, trainer.is_global_zero = False, False
callback.on_validation_end(trainer, None)
assert not path.exists()
trainer.is_global_zero = True
callback.on_validation_end(trainer, None)
trainer.current_epoch, trainer.global_step = 1, 20
trainer.callback_metrics = {"ESR_packed_0": 0.009, "ESR_packed_1": 0.0008}
callback.on_validation_end(trainer, None)
# A single-model run records ESR, never training loss or NaN.
Path(config).write_text(json.dumps({"net": {"name": "WaveNet"}}))
scope["install_esr_callback"]()
single = full._create_callbacks({})[-1]
trainer.current_epoch, trainer.global_step = 2, 30
trainer.callback_metrics = {"ESR": float("nan"), "val_loss": 9}
single.on_validation_end(trainer, None)
trainer.callback_metrics = {"ESR": 0.0}
single.on_validation_end(trainer, None)
`, scriptPath, configPath], { encoding: 'utf-8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const records: unknown[] = readFileSync(join(directory, TRAINING_METRICS_FILENAME), 'utf-8').trim().split('\n')
        .map((line) => JSON.parse(line))
      expect(records).toEqual([
        { epoch: 1, step: 10, models: [
          { submodelIndex: 0, submodelName: 'channels_8', esr: 0.0064 },
          { submodelIndex: 1, submodelName: 'channels_20', esr: 0.000951 }
        ] },
        { epoch: 2, step: 20, models: [
          { submodelIndex: 0, submodelName: 'channels_8', esr: 0.009 },
          { submodelIndex: 1, submodelName: 'channels_20', esr: 0.0008 }
        ] },
        { epoch: 3, step: 30, models: [{ submodelIndex: null, submodelName: null, esr: 0 }] }
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
