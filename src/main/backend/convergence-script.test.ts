import { execFileSync, spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { buildConvergenceScript } from './convergence-script'

const python = process.env.NAM_BOT_SMOKE_PYTHON ?? 'python'
const pythonAvailable = spawnSync(python, ['--version']).status === 0

function run(code: string, input: unknown = null): unknown {
  return JSON.parse(execFileSync(python, ['-c', `import json, math, sys\n${buildConvergenceScript()}\n${code}\nprint(json.dumps(result, allow_nan=False))`],
    { input: JSON.stringify(input), encoding: 'utf8', timeout: 30_000 }))
}

describe.skipIf(!pythonAvailable)('versioned convergence detector', () => {
  it('replays the two report histories without looking ahead', () => {
    // Anonymous numbers only: five ESRs per completed epoch, no capture metadata or local paths.
    const histories: unknown = JSON.parse(readFileSync(new URL('./fixtures/convergence-histories.json', import.meta.url), 'utf8'))
    expect(run(String.raw`
histories = json.load(sys.stdin)
result = {}
for length, rows in histories.items():
    result[length] = {}
    for level in CONVERGENCE_RULES:
        monitor = ConvergenceMonitor({i: str(i) for i in range(5)}, {"mode": "convergence", "level": level, "maxEpochs": None}, None)
        stopped = None
        for epoch, values in enumerate(rows, 1):
            if monitor.observe(epoch, [{"submodelIndex": i, "esr": value} for i, value in enumerate(values)]):
                stopped = epoch
                break
        result[length][level] = stopped
`, histories)).toEqual({ '666': { fast: 417, balanced: 645, thorough: null }, '2000': { fast: 466, balanced: 645, thorough: 1152 } })
  })

  it('observes all levels in fixed mode without stopping, retaining first attainment', () => {
    expect(run(String.raw`
m = ConvergenceMonitor({None: "Model"}, {"mode": "fixed", "level": "balanced", "maxEpochs": None}, 2000)
assert not any(m.observe(e, [{"submodelIndex": None, "esr": 0.02}]) for e in range(1, 501))
assert m.status()["achievedLevel"] == "thorough"
before = [s["firstReachedEpoch"] for s in m.levels.values()]
for e in range(501, 530):
    m.observe(e, [{"submodelIndex": None, "esr": 0.02 * (0.98 ** (e-500))}])
result = [before, m.status()["achievedLevel"], m.levels["fast"]["qualified"]]
`)).toEqual([[104, 154, 304], 'thorough', false])
  })

  it('protects a slower submodel and keeps observing meaningful cumulative improvement', () => {
    expect(run(String.raw`
m = ConvergenceMonitor({0: "Fast model", 1: "Slow model"}, {"mode": "convergence", "level": "fast", "maxEpochs": None}, None)
stops = [m.observe(e, [{"submodelIndex": 0, "esr": .01}, {"submodelIndex": 1, "esr": .2 * .998 ** e}]) for e in range(1, 501)]
result = [any(stops), m.levels["fast"]["waitingModels"]]
`)).toEqual([false, ['Slow model']])
  })

  it('uses previous history but requires five fresh confirmations after a live change', () => {
    expect(run(String.raw`
m = ConvergenceMonitor({None: "Model"}, {"mode": "fixed", "level": "balanced", "maxEpochs": None}, 666)
for e in range(1, 501): m.observe(e, [{"submodelIndex": None, "esr": .01}])
m.set_policy({"mode": "convergence", "level": "thorough", "maxEpochs": None}, 501)
result = [m.observe(e, [{"submodelIndex": None, "esr": .01}]) for e in range(501, 507)]
`)).toEqual([false, false, false, false, false, true])
  })

  it('retains the original fixed target and rejects returning to fixed for convergence-start runs', () => {
    expect(run(String.raw`
fixed = {"mode": "fixed", "level": "balanced", "maxEpochs": None}
auto = {"mode": "convergence", "level": "balanced", "maxEpochs": None}
m = ConvergenceMonitor({None: "Model"}, fixed, 666)
m.set_policy(auto, 20)
assert m.limit() is None
m.set_policy(fixed, 700)
assert m.limit() == 666
a = ConvergenceMonitor({None: "Model"}, auto, 666)
try:
    a.set_policy(fixed, 10)
    raise AssertionError("Must reject switching back")
except ValueError: pass
m.finish("convergence")
try:
    m.set_policy(fixed, 700)
    raise AssertionError("Must reject changes once finishing")
except ValueError: pass
result = [m.original_epoch_limit, a.original_epoch_limit]
`)).toEqual([666, null])
  })

  it('does not count duplicate epochs and clears observation windows on invalid or incomplete values', () => {
    expect(run(String.raw`
result = []
for invalid in [[], [{"submodelIndex": None, "esr": float("nan")}], [{"submodelIndex": None, "esr": -1}], [{"submodelIndex": 1, "esr": .01}]]:
    m = ConvergenceMonitor({None: "Model"}, {"mode": "convergence", "level": "fast", "maxEpochs": None}, None)
    for e in range(1, 104):
        m.observe(e, [{"submodelIndex": None, "esr": 0}])
        assert not m.observe(e, [{"submodelIndex": None, "esr": 0}])
    assert not m.observe(104, invalid)
    assert m.phase == "unavailable"
    stopped = next(e for e in range(105, 300) if m.observe(e, [{"submodelIndex": None, "esr": 0}]))
    result.append(stopped)
`)).toEqual([159, 159, 159, 159])
  })
})
