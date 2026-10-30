import type { JSX } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import type { JobRuntimeState } from '../../state/types'
import { canExportTrainingModel, isActiveRuntime } from './job-helpers'

/** The run a pending Stop refers to, while the dialog can still stop it. */
export function findStoppableRuntime(queue: JobRuntimeState[], jobId: string | null): JobRuntimeState | undefined {
  return queue.find((runtime) => runtime.jobId === jobId
    && isActiveRuntime(runtime.status) && runtime.status !== 'finalizing')
}

interface StopTrainingDialogProps {
  runtime: JobRuntimeState | undefined
  exportInProgress: boolean
  onKeepTraining: () => void
  onSaveAndStop: (jobId: string) => void
  onDiscardAndStop: (jobId: string) => void
}

/** Shared by Jobs and Dashboard, so Stop always asks before it ends a run. */
export default function StopTrainingDialog({
  runtime,
  exportInProgress,
  onKeepTraining,
  onSaveAndStop,
  onDiscardAndStop
}: StopTrainingDialogProps): JSX.Element {
  const canSave = runtime !== undefined && canExportTrainingModel(runtime)
  return (
    <ConfirmDialog
      isOpen={runtime !== undefined}
      title="Stop training?"
      message={canSave
        ? 'Save & stop exports the best validated weights for every embedded model, then finishes training cleanly. Discard & stop ends training immediately without a new export. Existing exports and checkpoints are kept.'
        : 'There is no exportable checkpoint yet, or an export is already in progress. You can keep training or stop immediately without a new export. Existing exports and checkpoints are kept.'}
      confirmLabel="Save & stop"
      confirmClassName="btn btn-green"
      confirmDisabled={!canSave || exportInProgress}
      alternateLabel="Discard & stop"
      alternateClassName="btn btn-orange"
      cancelLabel="Keep training"
      onCancel={onKeepTraining}
      onConfirm={() => {
        if (runtime) onSaveAndStop(runtime.jobId)
      }}
      onAlternate={() => {
        if (runtime) onDiscardAndStop(runtime.jobId)
      }}
    />
  )
}
