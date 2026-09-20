import { formatPresetArchitectureTag, getEffectiveJobEpochs, getEffectiveJobLatency, type JobRuntimeState, type JobEsrEpoch } from './training'
import { convergenceCompletionLabel, CONVERGENCE_LABELS, CONVERGENCE_RULES, type ConvergenceStatus } from './convergence'

export type TrainingReportFormat = 'png' | 'html'

export interface ReportMetric {
  readonly submodelIndex: number | null
  readonly submodelName: string | null
  readonly esr: number | null
  /** One-based best-checkpoint epoch. */
  readonly epoch: number | null
}

/** Captured inside the trainer, at the same boundary as the exported weights. */
export interface TrainingExportEvidence {
  readonly convergence?: ConvergenceStatus
  readonly capturedAt: string
  readonly history: JobEsrEpoch[]
  readonly metrics: ReportMetric[]
}

export interface ReportFact {
  readonly label: string
  readonly value: string
}

/** A detached, allowlisted snapshot: no runtime paths, logs, notes or raw config. */
export interface TrainingReportData {
  readonly convergence?: ConvergenceStatus
  readonly schemaVersion: 1
  readonly appVersion: string
  readonly jobName: string
  readonly modelName: string
  readonly modelFilename: string | null
  readonly status: string
  readonly generatedAt: string
  readonly startedAt: string | null
  readonly finishedAt: string | null
  readonly savedModel: boolean
  readonly facts: ReportFact[]
  readonly settings: ReportFact[]
  readonly settingsResolved?: boolean
  readonly metadata: ReportFact[]
  readonly metrics: ReportMetric[]
  readonly history: JobEsrEpoch[]
}

export interface TrainingReportResult {
  paths: string[]
  warnings: string[]
}

export function reportBasename(path: string): string {
  return path.split(/[\\/]/).at(-1) || 'Model'
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function oneBasedEpoch(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value + 1 : null
}

function display(value: string | number | null | undefined): string {
  return value == null || value === '' ? 'Unavailable' : String(value)
}

export function buildTrainingReportData(
  runtime: JobRuntimeState,
  options: { appVersion: string; modelPath: string | null; evidence?: TrainingExportEvidence; now?: string; snapshot?: boolean }
): TrainingReportData {
  const preset = runtime.frozenPreset
  const convergence = structuredClone(options.evidence?.convergence ?? (options.snapshot ? undefined : runtime.convergence))
  // Monitoring exceptions can contain private workspace paths. Reports expose
  // the failure state, while detailed diagnostics remain in the local log.
  if (convergence?.message) convergence.message = 'Convergence monitoring was unavailable at this point.'
  const stopping = convergence?.policy ?? runtime.frozenJob.stopping
  const planned = convergence ? (convergence.policy.mode === 'fixed' ? convergence.originalEpochLimit : convergence.policy.maxEpochs)
    : runtime.plannedEpochs ?? (preset ? getEffectiveJobEpochs(runtime.frozenJob, preset) : null)
  const plannedLabel = stopping?.mode === 'convergence' && stopping.maxEpochs === null ? 'Until convergence' : display(planned)
  const generatedAt = options.evidence?.capturedAt ?? options.now ?? new Date().toISOString()
  const history = structuredClone(options.evidence?.history ?? runtime.esrHistory ?? [])
  const packed = runtime.checkpointSummary?.packedSubmodels
  const metrics: ReportMetric[] = options.evidence ? structuredClone(options.evidence.metrics) : packed?.length
    ? packed.map(model => ({ submodelIndex: model.submodelIndex, submodelName: model.submodelName ?? null,
      esr: finite(model.bestValidationEsr), epoch: oneBasedEpoch(model.epoch) }))
    : [{ submodelIndex: null, submodelName: null, esr: finite(runtime.checkpointSummary?.bestValidationEsr), epoch: null }]
  // A snapshot without checkpoint evidence must not borrow later live metrics.
  if (options.snapshot && !options.evidence) {
    for (let index = 0; index < metrics.length; index++) metrics[index] = { ...metrics[index], esr: null, epoch: null }
    history.length = 0
  }
  const recordedEpochs = history.length ? history.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) : null
  const completedEpochs = !options.snapshot && runtime.status === 'succeeded'
    ? Math.max(recordedEpochs ?? 0, finite(runtime.currentEpoch) ?? 0, oneBasedEpoch(runtime.checkpointSummary?.latestCheckpointEpoch) ?? 0) || null
    : recordedEpochs ?? (options.snapshot ? null : oneBasedEpoch(runtime.checkpointSummary?.latestCheckpointEpoch))
  const finishedAt = options.snapshot ? null : runtime.finishedAt ?? null
  const elapsed = Date.parse(finishedAt ?? generatedAt) - Date.parse(runtime.startedAt ?? '')
  const seconds = Math.floor(elapsed / 1000)
  const duration = Number.isFinite(elapsed) && elapsed >= 0 && !['process_state_lost', 'force_stop_failed'].includes(runtime.errorCategory ?? '')
    ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : 'Unavailable'
  const values = preset?.values
  const metadata = runtime.frozenJob.metadata
  const metadataFields: Array<[string, string | number | undefined]> = [
    ['Modeled by', metadata.modeledBy], ['Gear type', metadata.gearType], ['Make', metadata.gearMake],
    ['Model', metadata.gearModel], ['Tone', metadata.toneType], ['Input level (dBu)', metadata.inputLevelDbu],
    ['Output level (dBu)', metadata.outputLevelDbu]
  ]
  const settings: ReportFact[] = values ? [
    { label: 'Model family', value: values.modelFamily }, { label: 'Architecture size', value: values.architectureSize },
    { label: 'Batch size', value: String(values.batchSize) }, { label: 'Learning rate', value: String(values.learningRate) },
    { label: 'Learning rate decay', value: String(values.learningRateDecay) }, { label: 'Samples per example', value: String(values.ny) },
    { label: 'MRSTFT', value: values.fitMrstft ? `Enabled · weight ${values.mrstftWeight}` : 'Disabled' },
    { label: 'Weight decay', value: String(values.weightDecay) }, { label: 'Output normalization (dB RMS)', value: display(values.outputNormalizeRmsDb) },
    { label: 'Expert overrides', value: Object.keys(preset.expert).length ? 'Applied; values shown are preset defaults' : 'None' }
  ] : []
  return {
    ...(convergence ? { convergence } : {}),
    schemaVersion: 1, appVersion: options.appVersion, jobName: runtime.jobName,
    modelName: metadata.name?.trim() || runtime.jobName,
    modelFilename: options.modelPath ? reportBasename(options.modelPath) : null,
    status: options.snapshot ? 'Training snapshot' : runtime.status === 'succeeded'
      ? convergence?.completionReason ? convergenceCompletionLabel(convergence) : runtime.finishedEarly ? 'Finished early' : 'Completed' : runtime.status === 'canceled' ? 'Stopped' : runtime.status === 'failed' ? 'Failed' : 'Training snapshot',
    generatedAt, startedAt: runtime.startedAt ?? null, finishedAt, savedModel: options.modelPath !== null,
    facts: [
      { label: 'Preset', value: preset?.name ?? 'Unavailable' },
      { label: 'Architecture', value: preset ? formatPresetArchitectureTag(preset) : 'Unavailable' },
      { label: 'Duration', value: duration },
      { label: 'Epochs · completed / planned', value: `${display(completedEpochs)} / ${plannedLabel}` },
      ...(convergence ? [
        { label: 'Training mode', value: stopping?.mode === 'convergence' ? `Until convergence · ${CONVERGENCE_LABELS[convergence.policy.level]}` : 'Fixed epochs' },
        { label: 'Convergence reached', value: convergence.achievedLevel ? CONVERGENCE_LABELS[convergence.achievedLevel] : 'Not reached' },
        { label: 'Convergence rules', value: convergence.version === 1
          ? `v1 · ${CONVERGENCE_RULES[convergence.policy.level].window} validations · below ${CONVERGENCE_RULES[convergence.policy.level].tolerance * 100}% improvement · 5 confirmations`
          : `v${convergence.version}` }
      ] : []),
      { label: 'Device', value: display(runtime.deviceSummary?.deviceName ?? runtime.deviceSummary?.acceleratorUsed) },
      { label: 'Latency', value: runtime.frozenJob.trainingOverrides.latencyMode === 'auto' ? 'Auto-align' : 'Manual' },
      { label: 'Delay (samples)', value: display(runtime.latencyAlignment?.delaySamples ?? (runtime.frozenJob.trainingOverrides.latencyMode === 'manual'
        ? preset ? getEffectiveJobLatency(runtime.frozenJob, preset) : runtime.frozenJob.trainingOverrides.latencySamples : null)) },
      { label: options.snapshot ? 'Saved checkpoints' : 'Checkpoints', value: options.snapshot ? options.evidence ? String(metrics.length) : 'Unavailable' : display(runtime.checkpointSummary?.checkpointCount) }
    ], settings, metadata: metadataFields.filter(([, value]) => value != null && value !== '').map(([label, value]) => ({ label, value: String(value) })),
    metrics, history
  }
}
