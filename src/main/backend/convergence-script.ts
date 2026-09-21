import { CONVERGENCE_CONFIRMATIONS, CONVERGENCE_RULES, CONVERGENCE_VERSION } from '../../shared/convergence'

/** One detector for live training and historical replay. No machine-specific tuning. */
export function buildConvergenceScript(): string {
  return `CONVERGENCE_VERSION = ${CONVERGENCE_VERSION}\nCONVERGENCE_RULES = ${JSON.stringify(CONVERGENCE_RULES)}\nCONVERGENCE_CONFIRMATIONS = ${CONVERGENCE_CONFIRMATIONS}\n` + String.raw`
from statistics import median


def validate_stopping_policy(policy):
    if not isinstance(policy, dict) or policy.get("mode") not in ("fixed", "convergence"):
        raise ValueError("Invalid training mode")
    if policy.get("level") not in CONVERGENCE_RULES:
        raise ValueError("Invalid convergence level")
    cap = policy.get("maxEpochs")
    if cap is not None and (type(cap) is not int or cap < 1):
        raise ValueError("Invalid safety cap")
    if policy["mode"] == "fixed" and cap is not None:
        raise ValueError("Fixed mode uses its original epoch target")
    return {"mode": policy["mode"], "level": policy["level"], "maxEpochs": cap}


class ConvergenceMonitor:
    def __init__(self, expected_models, policy, original_epoch_limit):
        self.expected_models = expected_models
        self.policy = validate_stopping_policy(policy)
        self.original_epoch_limit = original_epoch_limit if self.policy["mode"] == "fixed" else None
        self.epoch = 0
        self.validated_epochs = 0
        self.best = {}
        self.rows = []
        self.phase = "warming"
        self.message = None
        self.reason = None
        self.changes = [{"epoch": 0, "policy": dict(self.policy)}]
        self.levels = {level: {"level": level, "confirmations": 0, "qualified": False,
            "firstReachedEpoch": None, "waitingModels": [], "recentImprovement": None,
            "observationCount": 0} for level in CONVERGENCE_RULES}

    def limit(self):
        return self.original_epoch_limit if self.policy["mode"] == "fixed" else self.policy["maxEpochs"]

    def unavailable(self, message):
        self.rows = []
        for state in self.levels.values():
            state.update(confirmations=0, qualified=False, waitingModels=[], recentImprovement=None, observationCount=0)
        self.phase, self.message = "unavailable", message

    @staticmethod
    def improvement(before, after):
        return max(0.0, (before - after) / before) if before > 0.0 else 0.0

    def observe(self, epoch, models):
        if epoch <= self.epoch or self.reason is not None:
            return False
        self.epoch = epoch
        values = {}
        for model in models:
            index, value = model.get("submodelIndex"), model.get("esr")
            if index in values or not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
                self.unavailable("Waiting for complete, finite validation ESR for every exported model.")
                return False
            values[index] = value
        if set(values) != set(self.expected_models):
            self.unavailable("Waiting for complete validation ESR for every exported model.")
            return False
        self.validated_epochs += 1
        self.message = None
        for index, value in values.items():
            self.best[index] = min(self.best.get(index, value), value)
        self.rows.append((values, dict(self.best)))
        self.rows = self.rows[-(max(rule["window"] for rule in CONVERGENCE_RULES.values()) + 1):]
        self.phase = "monitoring" if self.validated_epochs >= min(rule["minimum"] for rule in CONVERGENCE_RULES.values()) else "warming"
        for level, rule in CONVERGENCE_RULES.items():
            state = self.levels[level]
            window = rule["window"]
            ready = self.validated_epochs >= rule["minimum"] and len(self.rows) > window
            waiting = []
            largest_improvement = None
            state["observationCount"] = min(len(self.rows), window + 1)
            if ready:
                largest_improvement = 0.0
                recent = self.rows[-window:]
                split = (window + 1) // 2
                for index, name in self.expected_models.items():
                    gain = self.improvement(self.rows[-window-1][1][index], self.best[index])
                    trend = self.improvement(median(row[0][index] for row in recent[:split]),
                                             median(row[0][index] for row in recent[split:]))
                    largest_improvement = max(largest_improvement, gain, trend)
                    if gain >= rule["tolerance"] or trend >= rule["tolerance"]:
                        waiting.append(name)
            state["waitingModels"] = waiting
            state["recentImprovement"] = largest_improvement
            state["confirmations"] = min(CONVERGENCE_CONFIRMATIONS, state["confirmations"] + 1) if ready and not waiting else 0
            state["qualified"] = state["confirmations"] >= CONVERGENCE_CONFIRMATIONS
            if state["qualified"] and state["firstReachedEpoch"] is None:
                state["firstReachedEpoch"] = epoch
        selected = self.levels[self.policy["level"]]
        return self.policy["mode"] == "convergence" and selected["qualified"]

    def finish(self, reason):
        self.reason = reason
        self.phase = "stopping"

    def status(self):
        achieved = next((level for level in reversed(CONVERGENCE_RULES) if self.levels[level]["firstReachedEpoch"] is not None), None)
        return {"version": CONVERGENCE_VERSION, "policy": dict(self.policy),
            "originalEpochLimit": self.original_epoch_limit, "epoch": self.epoch,
            "validatedEpochs": self.validated_epochs, "phase": self.phase,
            "levels": [dict(state) for state in self.levels.values()], "achievedLevel": achieved,
            "completionReason": self.reason, "message": self.message, "changes": list(self.changes)}
`
}
