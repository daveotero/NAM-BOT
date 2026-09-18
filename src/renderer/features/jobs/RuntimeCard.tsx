import { useState } from 'react'
import {
  JobPackedSubmodelCheckpointSummary,
  JobRuntimeState,
  TrainingPresetFile,
  formatPresetArchitectureTag
} from '../../state/types'
import { handleCardToggleKeyDown, shouldIgnoreCardToggle } from '../../utils/card-toggle'
import EsrHistoryChart from './EsrHistoryChart'
import { getEsrSeriesColor } from './esr-chart-data'
import {
  getDisplayState,
  getStatusSentence,
  getStopActionState,
  getProgressPercent,
  getCollapsedSummaryItems,
  getPlannedEpochsLabel,
  getDetailedDeviceLabel,
  getLatestTerminalLine,
  isActiveRuntime,
  getOutputPath,
  formatEsr,
  formatPackedSubmodelMetricLabel,
  getBestEsrLabel,
  canExportTrainingModel,
  QueueDisplayState
} from './job-helpers'

export type RuntimeArtifactTarget = 'workspace' | 'output' | 'workspace-log' | 'run-log' | 'model' | 'snapshot'

interface RuntimeArtifactLink {
  target: RuntimeArtifactTarget
  label: string
  path: string
}

interface RuntimeEsrItem {
  label: string
  value: string
  color: string
}

interface RuntimeCardProps {
  runtime: JobRuntimeState
  presets: TrainingPresetFile[]
  nowMs: number
  isExpanded: boolean
  isLogsVisible: boolean
  terminalLog: string
  isLoadingLog: boolean
  onToggleExpanded: (jobId: string) => void
  onToggleLogs: (runtime: JobRuntimeState) => Promise<void>
  onUnqueue?: (jobId: string) => Promise<void>
  onCancel: (jobId: string) => Promise<void>
  onForceStop: (jobId: string) => Promise<void>
  onExportModel?: (jobId: string) => Promise<void>
  isExporting?: boolean
  onCreateDraftFromRuntime?: (runtime: JobRuntimeState) => Promise<void>
  onUseRuntimeAsTemplate?: (runtime: JobRuntimeState) => void
  onOpenFolder: (jobId: string) => Promise<void>
  onOpenArtifact: (jobId: string, target: RuntimeArtifactTarget) => Promise<void>
  onClearFinished?: (jobId: string) => Promise<void>
}

function cleanArtifactPath(path: string | null | undefined): string | null {
  const trimmed = path?.trim()
  return trimmed ? trimmed : null
}

function getPackedSubmodelChannelCount(submodel: JobPackedSubmodelCheckpointSummary): number | null {
  const match = /^channels_(\d+)$/i.exec(submodel.submodelName ?? '')
  if (!match) {
    return null
  }

  const channelCount = Number(match[1])
  return Number.isFinite(channelCount) ? channelCount : null
}

function formatCompactEsrLabel(label: string): string {
  return label.replace(/\s+ESR$/i, '')
}

function buildRuntimeEsrItems(runtime: JobRuntimeState): RuntimeEsrItem[] {
  const packedSubmodels = runtime.checkpointSummary?.packedSubmodels ?? []
  if (packedSubmodels.length > 0) {
    return [...packedSubmodels]
      .sort((left, right) => {
        const leftChannels = getPackedSubmodelChannelCount(left)
        const rightChannels = getPackedSubmodelChannelCount(right)
        if (leftChannels != null && rightChannels != null && leftChannels !== rightChannels) {
          return leftChannels - rightChannels
        }
        if (leftChannels != null && rightChannels == null) {
          return -1
        }
        if (leftChannels == null && rightChannels != null) {
          return 1
        }
        return left.submodelIndex - right.submodelIndex
      })
      .map((submodel) => ({
        label: formatCompactEsrLabel(formatPackedSubmodelMetricLabel(submodel)),
        value: formatEsr(submodel.bestValidationEsr),
        color: getEsrSeriesColor(submodel.submodelIndex)
      }))
  }

  return [{
    label: formatCompactEsrLabel(getBestEsrLabel(runtime)),
    value: formatEsr(runtime.checkpointSummary?.bestValidationEsr),
    color: getEsrSeriesColor(0)
  }]
}

function buildArtifactLinks(runtime: JobRuntimeState, outputPath: string): RuntimeArtifactLink[] {
  const candidates: Array<{ target: RuntimeArtifactTarget; label: string; path: string | null }> = [
    { target: 'workspace', label: 'Workspace folder', path: cleanArtifactPath(runtime.workspaceDirectory) },
    { target: 'output', label: 'Output folder', path: cleanArtifactPath(outputPath) },
    { target: 'workspace-log', label: 'Workspace log', path: cleanArtifactPath(runtime.terminalLogPath) },
    { target: 'run-log', label: 'Saved run log', path: cleanArtifactPath(runtime.publishedTerminalLogPath) },
    { target: 'model', label: 'Model file', path: cleanArtifactPath(runtime.publishedModelPath) },
    { target: 'snapshot', label: 'Latest exported snapshot', path: cleanArtifactPath(runtime.modelExports?.at(-1)?.path) }
  ]

  return candidates.flatMap((candidate) => candidate.path
    ? [{ target: candidate.target, label: candidate.label, path: candidate.path }]
    : []
  )
}

function formatLatencySamples(samples: number): string {
  return `${samples} sample${Math.abs(samples) === 1 ? '' : 's'}`
}

function getLatencyModeLabel(runtime: JobRuntimeState): string {
  const mode = runtime.latencyAlignment?.mode ?? runtime.frozenJob.trainingOverrides.latencyMode ?? 'manual'
  return mode === 'auto' ? 'Auto-align' : 'Manual'
}

function getLatencyDelayLabel(runtime: JobRuntimeState): string {
  const alignment = runtime.latencyAlignment
  if (alignment?.delaySamples != null) {
    return formatLatencySamples(alignment.delaySamples)
  }

  if (alignment?.status === 'auto_pending') {
    return 'Analyzing...'
  }
  if (alignment?.status === 'auto_failed') {
    return 'Failed'
  }
  if (alignment?.status === 'auto_skipped') {
    return 'Preset locked'
  }

  const fallbackDelay = runtime.frozenJob.trainingOverrides.latencySamples
  return typeof fallbackDelay === 'number' && Number.isFinite(fallbackDelay)
    ? formatLatencySamples(fallbackDelay)
    : 'Not set'
}

function getLatencyDelayTitle(runtime: JobRuntimeState): string {
  const alignment = runtime.latencyAlignment
  const details = [alignment?.message, alignment?.inputVersion ? `NAM input ${alignment.inputVersion}` : null]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  return details.length > 0 ? details.join(' ') : getLatencyDelayLabel(runtime)
}

export function renderDisplayBadge(displayState: QueueDisplayState) {
  return (
    <span className={`queue-status-badge ${displayState.toLowerCase()}${displayState === 'Running' ? ' processing-text' : ''}`}>
      {displayState}
    </span>
  )
}

export default function RuntimeCard({
  runtime,
  presets,
  nowMs,
  isExpanded,
  isLogsVisible,
  terminalLog,
  isLoadingLog,
  onToggleExpanded,
  onToggleLogs,
  onUnqueue,
  onCancel,
  onForceStop,
  onExportModel,
  isExporting = false,
  onCreateDraftFromRuntime,
  onUseRuntimeAsTemplate,
  onOpenFolder,
  onOpenArtifact,
  onClearFinished
}: RuntimeCardProps) {
  const [actionError, setActionError] = useState<string | null>(null)
  const runAction = async (action: () => Promise<void>): Promise<void> => {
    try {
      setActionError(null)
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }
  const displayState = getDisplayState(runtime)
  const statusSentence = getStatusSentence(runtime)
  const stopAction = getStopActionState(runtime, nowMs)
  const progressPercent = runtime.status === 'running' || runtime.status === 'stopping' ? getProgressPercent(runtime) : null
  const hasTerminalToggle = displayState !== 'Queued'
  const isFinishedDisplay = displayState === 'Successful' || displayState === 'Error'
  const isSuccessfulDisplay = displayState === 'Successful'
  const outputPath = getOutputPath(runtime)
  const batchSourceName = runtime.frozenJob.batchSourceName?.trim() || ''
  const preset = runtime.frozenPreset ?? presets.find((entry) => entry.id === runtime.frozenJob.presetId)
  const presetName = preset?.name || runtime.frozenJob.presetId || 'Unknown'
  const presetTag = preset ? formatPresetArchitectureTag(preset) : 'CUSTOM'
  const latencyModeLabel = getLatencyModeLabel(runtime)
  const latencyDelayLabel = getLatencyDelayLabel(runtime)
  const latencyDelayTitle = getLatencyDelayTitle(runtime)
  const collapsedSummaryItems = getCollapsedSummaryItems(runtime, presetName, nowMs)
  const artifactLinks = buildArtifactLinks(runtime, outputPath)
  const esrItems = buildRuntimeEsrItems(runtime)
  const hasPrimaryActions = (displayState === 'Queued' && onUnqueue)
    || (displayState === 'Running' && stopAction)
    || (isSuccessfulDisplay && outputPath)
    || (isFinishedDisplay && (onCreateDraftFromRuntime || onUseRuntimeAsTemplate))
  const hasSecondaryActions = hasTerminalToggle || (isFinishedDisplay && onClearFinished)

  return (
    <div
      key={runtime.jobId}
      className={`job-card queue-card queue-card-${displayState.toLowerCase()}`}
      role={hasTerminalToggle ? 'button' : undefined}
      tabIndex={hasTerminalToggle ? 0 : undefined}
      onClick={hasTerminalToggle ? (event) => {
        if (shouldIgnoreCardToggle(event.target)) {
          return
        }
        onToggleExpanded(runtime.jobId)
      } : undefined}
      onKeyDown={hasTerminalToggle ? (event) => handleCardToggleKeyDown(event, () => onToggleExpanded(runtime.jobId)) : undefined}
    >
      <div className="queue-card-summary">
        <div className="job-info queue-card-main">
          <h4>{runtime.jobName}</h4>
          <div className="queue-card-status-row">
            {renderDisplayBadge(displayState)}
            <p
              className={`queue-card-headline${displayState === 'Error' ? ' queue-card-headline-error' : ''}`}
              title={statusSentence}
            >
              {statusSentence}
            </p>
          </div>

          {collapsedSummaryItems.length > 0 && (
            <div className="queue-card-stat-row">
              {collapsedSummaryItems.map((item) => (
                <span key={`${runtime.jobId}-${item.label}`} className={`queue-card-stat${item.tone === 'error' ? ' queue-card-stat-error' : ''}`}>
                  <span className="meta-label">{item.label}</span>
                  <span>{item.value}</span>
                </span>
              ))}
            </div>
          )}

          {batchSourceName && (
            <div className="job-batch-badge queue-batch-badge" title={`Batch: ${batchSourceName}`}>
              Batch: {batchSourceName}
            </div>
          )}

          {(runtime.status === 'running' || runtime.status === 'stopping') && progressPercent != null && (
            <div className="training-progress-group">
              <div className="training-progress-bar" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="training-progress-meta">
                <span>{`${Math.round(progressPercent)}% complete`}</span>
              </div>
            </div>
          )}
        </div>

        <div className="job-actions queue-card-actions">
          {hasPrimaryActions && (
            <div className="queue-card-action-row queue-card-action-row-primary">
              {runtime.status === 'running' && onExportModel && (
                <button type="button" className="btn btn-sm btn-green"
                  disabled={isExporting || !canExportTrainingModel(runtime)}
                  title={canExportTrainingModel(runtime)
                    ? 'Save the best validated model so far and keep training.'
                    : 'Available after a validated checkpoint in a new training run'}
                  onClick={() => void onExportModel(runtime.jobId)}>
                  {isExporting || runtime.modelExportPending ? 'Saving...' : 'Save Snapshot'}
                </button>
              )}
              {displayState === 'Queued' && onUnqueue && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void runAction(() => onUnqueue(runtime.jobId))}
                >
                  Unqueue
                </button>
              )}

              {displayState === 'Running' && stopAction && (
                <button
                  className="btn btn-sm btn-orange"
                  onClick={() => void runAction(() => stopAction.isForce ? onForceStop(runtime.jobId) : onCancel(runtime.jobId))}
                  disabled={stopAction.disabled}
                >
                  {stopAction.label}
                </button>
              )}

              {displayState === 'Successful' && outputPath && (
                <button className="btn btn-sm btn-green" onClick={() => void runAction(() => onOpenFolder(runtime.jobId))}>
                  Open Folder
                </button>
              )}

              {isFinishedDisplay && onCreateDraftFromRuntime && (
                <button
                  className={`btn btn-sm ${displayState === 'Error' ? 'btn-gold' : 'btn-secondary'}`}
                  onClick={() => void runAction(() => onCreateDraftFromRuntime(runtime))}
                  title={displayState === 'Error'
                    ? 'Create an editable draft from this failed or stopped job'
                    : 'Create a new editable draft from this finished job'}
                >
                  Create Draft
                </button>
              )}

              {isFinishedDisplay && onUseRuntimeAsTemplate && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => onUseRuntimeAsTemplate(runtime)}
                  title="Create editable draft jobs from this finished job and new output files"
                >
                  Use as Template
                </button>
              )}
            </div>
          )}

          {hasSecondaryActions && (
            <div className="queue-card-action-row queue-card-action-row-secondary">
              {hasTerminalToggle && (
                <button
                  className={`btn btn-sm btn-secondary${isExpanded ? ' is-toggled' : ''}`}
                  onClick={() => onToggleExpanded(runtime.jobId)}
                >
                  {isExpanded ? 'Hide Details' : 'Show Details'}
                </button>
              )}

              {isFinishedDisplay && onClearFinished && (
                <button className="btn btn-sm btn-secondary" onClick={() => void runAction(() => onClearFinished(runtime.jobId))}>
                  Clear
                </button>
              )}

              {hasTerminalToggle && (
                <button
                  className={`btn btn-sm btn-secondary${isLogsVisible ? ' is-toggled' : ''}`}
                  onClick={() => void runAction(() => onToggleLogs(runtime))}
                  disabled={isLoadingLog}
                >
                  {isLoadingLog ? 'Loading...' : isLogsVisible ? 'Hide Logs' : 'Show Logs'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {actionError && <p role="alert" className="operation-error">{actionError}</p>}
      {(runtime.completionWarnings?.length ?? 0) > 0 && (
        <div role="status" className="completion-warnings" data-no-card-toggle="true">
          <strong>Completed with warnings</strong>
          <ul>{runtime.completionWarnings?.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>
      )}

      {hasTerminalToggle && isExpanded && (
        <div className="queue-card-details">
          <div className="runtime-details-layout">
            <div className="runtime-detail-column runtime-overview-column">
              <div className="runtime-detail-field">
                <span className="runtime-detail-label">Preset</span>
                <span className="runtime-preset-value">
                  <span className="queue-status-badge queued">{presetTag}</span>
                  <span>{presetName}</span>
                </span>
              </div>
              <div className="runtime-detail-facts">
                <div className="runtime-detail-fact">
                  <span className="runtime-detail-label">Latency</span>
                  <span className="runtime-detail-value">{latencyModeLabel}</span>
                </div>
                <div className="runtime-detail-fact">
                  <span className="runtime-detail-label">Delay</span>
                  <span className="runtime-detail-value" title={latencyDelayTitle}>{latencyDelayLabel}</span>
                </div>
                <div className="runtime-detail-fact">
                  <span className="runtime-detail-label">Epochs</span>
                  <span className="runtime-detail-value">{getPlannedEpochsLabel(runtime)}</span>
                </div>
                <div className="runtime-detail-fact">
                  <span className="runtime-detail-label">Checkpoints</span>
                  <span className="runtime-detail-value">{runtime.checkpointSummary?.checkpointCount ?? 0}</span>
                </div>
                <div className="runtime-detail-fact runtime-detail-fact-wide">
                  <span className="runtime-detail-label">Device</span>
                  <span className="runtime-detail-value" title={getDetailedDeviceLabel(runtime)}>{getDetailedDeviceLabel(runtime)}</span>
                </div>
              </div>
            </div>

            <div className="runtime-detail-column runtime-esr-column">
              <span className="runtime-detail-label">ESR</span>
              <div className="runtime-esr-row">
                {esrItems.map((item) => (
                  <div className="runtime-esr-item" key={`${runtime.jobId}-${item.label}`}>
                    <span className="runtime-esr-label">{item.label}</span>
                    <span className="runtime-esr-value" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="runtime-detail-column runtime-artifacts-column">
              <span className="runtime-detail-label">Artifacts</span>
              {artifactLinks.length > 0 ? (
                <div className="runtime-artifact-links">
                  {artifactLinks.map((link) => (
                    <button
                      type="button"
                      className="runtime-artifact-link"
                      key={`${runtime.jobId}-${link.target}`}
                      title={link.path}
                      onClick={() => void runAction(() => onOpenArtifact(runtime.jobId, link.target))}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="runtime-empty-artifacts">No artifacts yet</span>
              )}
            </div>
          </div>
          <EsrHistoryChart history={runtime.esrHistory ?? []} active={isActiveRuntime(runtime.status)} />

          {(displayState === 'Running' || displayState === 'Error') && getLatestTerminalLine(runtime) && (
            <div className="queue-details-terminal">
              <span className="terminal-label">Latest terminal line</span>
              <div className="terminal-value">{getLatestTerminalLine(runtime)}</div>
            </div>
          )}
        </div>
      )}

      {isLogsVisible && (
        <div className="queue-inline-log" data-no-card-toggle="true">
          <div className="queue-inline-log-header">
            <span>Terminal Output</span>
            {isActiveRuntime(runtime.status) && <span>Auto-refreshing while active</span>}
          </div>
          <pre className="queue-inline-log-body">{terminalLog || '[no terminal output yet]'}</pre>
        </div>
      )}
    </div>
  )
}
