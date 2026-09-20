import log from 'electron-log/main'
import type { JobRuntimeState } from '../../shared/training'
import { buildTrainingReportData, type TrainingReportData } from '../../shared/training-report'
import { resolveJobConfigs } from '../config/configBuilder'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function number(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Unavailable'
}

export function buildRuntimeTrainingReport(
  runtime: JobRuntimeState, options: Parameters<typeof buildTrainingReportData>[1]
): TrainingReportData {
  const data = buildTrainingReportData(runtime, options)
  if (!runtime.frozenPreset) return data
  try {
    // Use the trainer's own merge rules without writing files or exposing config contents.
    const config = resolveJobConfigs(runtime.frozenJob, runtime.frozenPreset)
    const optimizer = record(config.modelConfig.optimizer)
    const scheduler = record(config.modelConfig.lr_scheduler)
    const loss = record(config.modelConfig.loss)
    const joint = Array.isArray(config.dataConfig.joint) ? config.dataConfig.joint : []
    const normalization = joint.map(record).find(entry => entry.name === 'nam.data.normalize_joint_dataset_output')
    return { ...data, settingsResolved: true, settings: [
      { label: 'Model family', value: runtime.frozenPreset.values.modelFamily },
      { label: 'Architecture size', value: runtime.frozenPreset.values.architectureSize },
      { label: 'Batch size', value: number(record(config.learningConfig.train_dataloader).batch_size) },
      { label: 'Learning rate', value: number(optimizer.lr) },
      { label: 'Exponential learning rate gamma', value: scheduler.class === 'ExponentialLR' ? number(record(scheduler.kwargs).gamma) : 'Not applicable' },
      { label: 'Samples per example', value: number(record(config.dataConfig.train).ny) },
      { label: 'MRSTFT weight', value: number(loss.mrstft_weight ?? 0) },
      { label: 'Pre-emphasized MRSTFT weight', value: number(loss.pre_emph_mrstft_weight ?? 0) },
      { label: 'Weight decay', value: number(optimizer.weight_decay ?? 0) },
      { label: 'Output normalization (dB RMS)', value: normalization ? number(record(normalization.kwargs).level_rms_dbfs) : 'Disabled' },
      { label: 'Expert overrides', value: Object.values(runtime.frozenPreset.expert).some(value => value !== undefined) ? 'Included in these settings' : 'None' }
    ] }
  } catch (error) {
    log.warn('Could not resolve frozen report settings; displaying labeled preset defaults:', error)
    return data
  }
}
