import { useEffect, useMemo, useState, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useAppStore,
  type AppSettings,
  type JobEditorSession,
  type JobInputAudioMode,
  type JobOutputRootMode,
  type BatchTemplateSource,
  type BatchOutputFile
} from '../../state/store'
import { AUDIO_FILE_ACCEPT, isSupportedAudioFile } from '../../../shared/audio'
import { getEffectiveJobEpochs, getEffectiveJobLatency } from '../../../shared/training'
import { buildModelFilename } from '../../../shared/model-filename'
import ConfirmDialog from '../../components/ConfirmDialog'
import WorkspaceToolbar from '../../components/WorkspaceToolbar'
import PropertySheet from '../../components/PropertySheet'
import WorkingIndicator from '../../components/WorkingIndicator'
import { useTerminalLogs } from '../../hooks/useTerminalLogs'
import {
  DEFAULT_PRESET_ID,
  JobSpec,
  JobPackedSubmodelSelection,
  JobRuntimeState,
  JobStatus,
  JobStopMode,
  JobLatencyMode,
  NAM_GEAR_TYPE_OPTIONS,
  NAM_TONE_TYPE_OPTIONS,
  NamEmbeddedMetadata,
  NamGearType,
  NamToneType,
  PackedPresetSubmodel,
  TrainingPresetFile,
  defaultJobSpec,
  formatPackedSubmodelDisplayName,
  formatPresetArchitectureTag,
  getPackedSubmodelSelectionKey,
  getPackedSubmodelsForPreset
} from '../../state/types'
import {
  isActiveRuntime,
  isQueuedRuntime,
  isFinishedTraining,
  filenameWithoutExt,
  getBasename,
  getDirname,
  getDisplayState,
  getStatusSentence,
  getPlannedEpochsLabel,
  canExportTrainingModel
} from './job-helpers'
import RuntimeCard, { renderDisplayBadge } from './RuntimeCard'
import { handleCardToggleKeyDown, shouldIgnoreCardToggle } from '../../utils/card-toggle'
import { formatPresetNameWithRewardTag } from '../about/aboutRewardPreset'
import {
  buildJobEditorSession,
  serializeJobEditorSession,
  applyStoredReusableDefaults,
  getStoredAppendEsrToModelFileNamePreference,
  createNewJobDraft,
  getStoredAppendPresetToModelFileNamePreference,
  getOutputRootModeForJob,
  getPreferredOutputRootSelection,
  getPreferredJobPreset,
  LAST_APPEND_ESR_STORAGE_KEY,
  LAST_APPEND_PRESET_NAME_STORAGE_KEY,
  LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
  LAST_USED_PRESET_STORAGE_KEY,
  persistOutputRootPreference,
  persistReusableJobDefaults,
  VIRTUAL_NEW_JOB_ID
} from './jobEditorSession'
import {
  buildDraftFromFrozenJob,
  buildDraftFromTemplateForOutput
} from './jobTemplateDrafts'

const SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY = 'nam-bot:skip-draft-delete-confirm'

function toPackedSubmodelSelection(submodel: PackedPresetSubmodel): JobPackedSubmodelSelection {
  return {
    submodelIndex: submodel.submodelIndex,
    submodelName: submodel.submodelName ?? null
  }
}

function withPackedSubmodelSelection(
  trainingOverrides: JobSpec['trainingOverrides'],
  packedSubmodels: JobPackedSubmodelSelection[] | undefined
): JobSpec['trainingOverrides'] {
  const { packedSubmodels: _packedSubmodels, ...remainingOverrides } = trainingOverrides
  return packedSubmodels ? { ...remainingOverrides, packedSubmodels } : remainingOverrides
}

function isBatchAudioFile(file: File): boolean {
  return isSupportedAudioFile(file.name)
}

function createBatchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

interface FilePickerRowProps {
  value: string
  displayValue?: string
  onChange: (val: string) => void
  placeholder?: string
  onBrowse: () => Promise<string | null>
  disabled?: boolean
  id?: string
  error?: boolean
}

function FilePickerRow({ value, displayValue, onChange, placeholder, onBrowse, disabled, id, error }: FilePickerRowProps) {
  const [browseError, setBrowseError] = useState<string | null>(null)
  const handleBrowse = async (): Promise<void> => {
    try {
      setBrowseError(null)
      const picked = await onBrowse()
      if (picked) onChange(picked)
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="file-picker-row">
      <input
        id={id}
        type="text"
        className={`form-input${error ? ' input-error' : ''}`}
        value={disabled ? displayValue ?? value : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        title={value}
        style={{
          ...(disabled ? { color: 'var(--text-steel)', cursor: 'not-allowed' } : {}),
          ...(error ? { borderColor: 'var(--neon-magenta)' } : {})
        }}
      />
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={handleBrowse}
        disabled={disabled}
        style={{ flexShrink: 0 }}
      >
        Browse
      </button>
      {browseError && <span role="alert" style={{ color: 'var(--neon-magenta)' }}>{browseError}</span>}
    </div>
  )
}

interface DraftCardProps {
  job: JobSpec
  presets: TrainingPresetFile[]
  onEdit: (job: JobSpec) => void
  onQueue: (jobId: string) => Promise<void>
  onDuplicate: (jobId: string) => Promise<void>
  onBatchFromTemplate: (job: JobSpec) => void
  onDelete: (job: JobSpec) => void
  isQueueing: boolean
}

function DraftCard({ job, presets, onEdit, onQueue, onDuplicate, onBatchFromTemplate, onDelete, isQueueing }: DraftCardProps) {
  const preset = presets.find(p => p.id === job.presetId)
  const presetName = preset ? formatPresetNameWithRewardTag(preset) : job.presetId || 'Unknown Preset'
  const presetTag = preset ? formatPresetArchitectureTag(preset) : 'CUSTOM'

  return (
    <div className="job-card draft-card">
      <div className="job-info">
        <h4>{job.name}</h4>
        <div className="job-meta">
          <div className="job-meta-main">
            {job.inputAudioIsDefault ? '[ Standard v3 Signal ]' : (getBasename(job.inputAudioPath) || 'No input')}
            {' -> '}
            {getBasename(job.outputAudioPath) || 'No output'}
          </div>
          <div className="job-meta-preset">
            <span className="meta-label">Preset:</span> <span className="queue-status-badge queued">{presetTag}</span> {presetName}
          </div>
          {job.batchSourceName && (
            <div className="job-batch-badge" title={`Created from ${job.batchSourceName}`}>
              Batch: {job.batchSourceName}
            </div>
          )}
        </div>
      </div>
      <div className="job-actions" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <button className="btn btn-sm btn-blue" onClick={() => onEdit(job)} disabled={isQueueing}>
          Edit
        </button>
        <button className="btn btn-sm btn-green" onClick={() => void onQueue(job.id)} disabled={isQueueing}>
          {isQueueing ? 'Queueing...' : 'Queue'}
          <WorkingIndicator active={isQueueing} />
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => void onDuplicate(job.id)} disabled={isQueueing}>
          Copy
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => onBatchFromTemplate(job)} disabled={isQueueing} title="Create a batch from this draft">
          Create Batch
        </button>
        <button className="btn btn-sm btn-orange" onClick={() => onDelete(job)} disabled={isQueueing}>
          Delete
        </button>
      </div>
    </div>
  )
}

const JOB_EDITOR_FORM_ID = 'job-editor-form'
const JOB_EDITOR_SECTIONS = [
  { id: 'job-audio', label: 'Name & audio' },
  { id: 'job-training', label: 'Training' },
  { id: 'job-model-output', label: 'Model output' },
  { id: 'job-metadata', label: 'Metadata' }
]

interface SortableDraftItemProps extends DraftCardProps {
  id: string
  reorderDisabled: boolean
}

function SortableDraftItem({ id, reorderDisabled, ...props }: SortableDraftItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled: reorderDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: reorderDisabled ? 'default' : isDragging ? 'grabbing' : 'grab',
    position: 'relative' as const,
    zIndex: isDragging ? 1000 : 1
  }

  return (
    <div ref={setNodeRef} style={style} {...(reorderDisabled ? {} : attributes)} {...listeners}>
      <DraftCard {...props} />
    </div>
  )
}

interface SortableQueueItemProps {
  runtime: JobRuntimeState
  queue: JobRuntimeState[]
  presets: TrainingPresetFile[]
  index: number
  reorderDisabled: boolean
  onUnqueue: (jobId: string) => Promise<void>
  onBatchFromRuntime: (runtime: JobRuntimeState) => void
}

function SortableQueueItem({ runtime, queue, presets, index, reorderDisabled, onUnqueue, onBatchFromRuntime }: SortableQueueItemProps) {
  const preset = runtime.frozenPreset ?? presets.find(p => p.id === runtime.frozenJob.presetId)
  const presetName = preset?.name || runtime.frozenJob.presetId || 'Unknown'
  const presetTag = preset ? formatPresetArchitectureTag(preset) : 'CUSTOM'
  const isBlocked = runtime.errorCategory === 'a2_diagnostics_pending'
  const headline = isBlocked ? getStatusSentence(runtime) : runtime.status === 'validating'
    ? 'Validating job before queue'
    : index === 0
      ? `Next to train - 1 of ${queue.length}`
      : `Waiting in queue - ${index + 1} of ${queue.length}`
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: runtime.jobId, disabled: reorderDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: reorderDisabled ? 'default' : isDragging ? 'grabbing' : 'grab',
    position: 'relative' as const,
    zIndex: isDragging ? 1000 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="job-card queue-card queue-card-queued"
      {...(reorderDisabled ? {} : attributes)}
      {...listeners}
    >
      <div className="queue-card-summary">
        <div className="job-info queue-card-main">
          <h4>{runtime.jobName}</h4>
          <div className="queue-card-status-row">
            {isBlocked ? <span className="queue-status-badge error">Diagnostics needed</span> : renderDisplayBadge('Queued')}
            <div className="queue-card-headline-group">
              <p className="queue-card-headline">{headline}</p>
              <div className="queue-card-stat-row">
                <span className="queue-card-stat">
                  <span className="meta-label">Preset</span>
                  <span><span className="queue-status-badge queued">{presetTag}</span> {presetName}</span>
                </span>
                <span className="queue-card-stat">
                  <span className="meta-label">Epochs</span>
                  <span>{getPlannedEpochsLabel(runtime)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="job-actions queue-card-actions" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {isBlocked && <a className="btn btn-sm btn-gold" href="#/diagnostics">Run Diagnostics</a>}
          <button className="btn btn-sm btn-secondary" onClick={() => onBatchFromRuntime(runtime)}>Create Batch</button>
          <button className="btn btn-sm btn-secondary" onClick={() => void onUnqueue(runtime.jobId)}>Unqueue</button>
        </div>
      </div>
    </div>
  )
}

export default function Jobs() {
  const { setIsTraining } = useAppStore()
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const loadPresets = useAppStore((state) => state.loadPresets)
  const jobEditorSession = useAppStore((state) => state.jobEditorSession)
  const setJobEditorSession = useAppStore((state) => state.setJobEditorSession)
  const clearJobEditorSession = useAppStore((state) => state.clearJobEditorSession)
  const drafts = useAppStore((state) => state.drafts)
  const setDrafts = useAppStore((state) => state.setDrafts)
  const queue = useAppStore((state) => state.queue)
  const setQueue = useAppStore((state) => state.setQueue)
  const loadJobs = useAppStore((state) => state.loadJobs)
  const queueControl = useAppStore((state) => state.queueControl)
  const jobsLoadError = useAppStore((state) => state.jobsLoadError)
  const presetWarnings = useAppStore((state) => state.presetWarnings)

  useEffect(() => {
    const active = queue.some(r => isActiveRuntime(r.status))
    setIsTraining(active)
  }, [queue, setIsTraining])
  const [isDragOver, setIsDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const searchQuery = search.trim().toLocaleLowerCase()
  const isFiltering = searchQuery.length > 0
  const [queueError, setQueueError] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const { logContents, logErrors, loadingLogIds, loadTerminalLog, clearTerminalLog } = useTerminalLogs(queue)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [pendingDeleteJob, setPendingDeleteJob] = useState<JobSpec | null>(null)
  const [pendingStopJobId, setPendingStopJobId] = useState<string | null>(null)
  const [exportingJobId, setExportingJobId] = useState<string | null>(null)
  const pendingStopJob = queue.find((runtime) => runtime.jobId === pendingStopJobId
    && isActiveRuntime(runtime.status) && runtime.status !== 'finalizing')
  const [skipDraftDeleteConfirm, setSkipDraftDeleteConfirm] = useState(false)
  const [queueingDraftIds, setQueueingDraftIds] = useState<Set<string>>(() => new Set())
  const batchEditorState = useAppStore((state) => state.batchEditorSession)
  const setBatchEditorState = useAppStore((state) => state.setBatchEditorSession)
  const [confirmResume, setConfirmResume] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const batchFileInputRef = useRef<HTMLInputElement>(null)
  const batchTemplateRef = useRef<BatchTemplateSource | null>(null)
  const queueingDraftIdsRef = useRef<Set<string>>(new Set())

  const loadData = async () => {
    await loadJobs()
  }

  const runAction = async (label: string, action: () => Promise<void>): Promise<void> => {
    try {
      setQueueError(null)
      await action()
    } catch (error) {
      setQueueError(`${label} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleResumeQueue = async (terminationConfirmed = false): Promise<void> => {
    if (queueControl.pauseReason === 'termination_unconfirmed' && !terminationConfirmed) {
      setConfirmResume(true)
      return
    }
    await runAction('Resume queue', async () => {
      await window.namBot.jobs.resumeQueue(terminationConfirmed)
      setConfirmResume(false)
      await loadData()
    })
  }

  const markDraftQueueing = (jobId: string): boolean => {
    if (queueingDraftIdsRef.current.has(jobId)) {
      return false
    }

    queueingDraftIdsRef.current.add(jobId)
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
    return true
  }

  const clearDraftQueueing = (jobId: string): void => {
    queueingDraftIdsRef.current.delete(jobId)
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const setManyDraftsQueueing = (jobIds: string[]): void => {
    for (const jobId of jobIds) {
      queueingDraftIdsRef.current.add(jobId)
    }
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const clearManyDraftsQueueing = (jobIds: string[]): void => {
    for (const jobId of jobIds) {
      queueingDraftIdsRef.current.delete(jobId)
    }
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const buildBatchOutputFiles = (files: File[]): BatchOutputFile[] => files.map((file) => ({
    outputAudioPath: window.namBot.jobs.getPathForFile(file) || file.name,
    outputFileName: file.name
  }))

  const openBatchEditor = async (files: File[], source: BatchTemplateSource | null): Promise<void> => {
    const audioFiles = files.filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      return
    }

    const outputFiles = buildBatchOutputFiles(audioFiles)
    const firstOutput = outputFiles[0]
    const firstOutputStem = filenameWithoutExt(firstOutput.outputFileName || firstOutput.outputAudioPath).trim() || 'Batch Training'
    const template = source?.template ?? createNewJobDraft({ presets, settings })
    const outputRootSelection = getPreferredOutputRootSelection(settings, firstOutput.outputAudioPath)
    const outputRootMode = source
      ? getOutputRootModeForJob(template, settings)
      : outputRootSelection.mode
    const outputRootFollowsAudio = outputRootMode === 'output-audio'
    const batchTemplate: JobSpec = {
      ...(JSON.parse(JSON.stringify(template)) as JobSpec),
      name: source ? template.name : firstOutputStem,
      outputAudioPath: firstOutput.outputAudioPath,
      outputRootDir: outputRootFollowsAudio
        ? getDirname(firstOutput.outputAudioPath)
        : source
          ? template.outputRootDir
          : outputRootSelection.outputRootDir,
      outputRootDirIsDefault: outputRootFollowsAudio,
      metadata: {
        ...template.metadata,
        name: ''
      },
      batchId: undefined,
      batchSourceName: undefined
    }

    setBatchEditorState({
      editorSession: buildJobEditorSession(`Batch Training (${outputFiles.length} files)`, batchTemplate, settings),
      outputFiles,
      source,
      batchId: createBatchId()
    })
  }

  useEffect(() => {
    void loadPresets()
    void loadData()
  }, [loadPresets, loadJobs])

  const hasActiveRuntimeClock = queue.some(
    (runtime) => isActiveRuntime(runtime.status)
  )
  useEffect(() => {
    if (!hasActiveRuntimeClock) {
      return
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [hasActiveRuntimeClock])

  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => {
    const hasAnyOpenLogs = Object.values(openLogs).some(Boolean)
    if (!hasAnyOpenLogs) {
      return
    }

    const interval = window.setInterval(() => {
      // Find which of the open logs are for active jobs
      const activeVisibleLogIds = queueRef.current
        .filter((runtime: JobRuntimeState) => openLogs[runtime.jobId] && isActiveRuntime(runtime.status))
        .map((runtime: JobRuntimeState) => runtime.jobId)

      activeVisibleLogIds.forEach((jobId: string) => {
        void loadTerminalLog(jobId)
      })
    }, 1500)

    return () => window.clearInterval(interval)
  }, [loadTerminalLog, openLogs])

  const handleCreateJob = () => {
    setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
  }

  const handleDropFiles = async (files: FileList) => {
    setIsDragOver(false)
    const audioFiles = Array.from(files).filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      throw new Error('Choose WAV, MP3, FLAC, AIFF, or AIF audio files.')
    }

    if (audioFiles.length > 1) {
      await openBatchEditor(audioFiles, null)
      return
    }

    const defaultInputRef = await window.namBot.jobs.getDefaultInputAudioPath() as string | null
    const appendPresetToModelFileName = getStoredAppendPresetToModelFileNamePreference()
    const appendEsrToModelFileName = getStoredAppendEsrToModelFileNamePreference()
    const copyFinalModelToOutputAudioFolder = window.localStorage.getItem(LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY) === 'true'
    const fallbackPreset = getPreferredJobPreset({ presets, settings })
    const createdJobs: JobSpec[] = []

    for (const file of audioFiles) {
      const filePath = window.namBot.jobs.getPathForFile(file) || file.name
      const outputStem = filenameWithoutExt(file.name)
      const preferredOutputRootSelection = getPreferredOutputRootSelection(settings, filePath)
      const draftInput = applyStoredReusableDefaults({
        ...defaultJobSpec,
        name: outputStem,
        presetId: fallbackPreset?.id ?? DEFAULT_PRESET_ID,
        appendPresetToModelFileName,
        appendEsrToModelFileName,
        copyFinalModelToOutputAudioFolder,
        inputAudioPath: defaultInputRef || '',
        outputAudioPath: filePath,
        outputRootDir: preferredOutputRootSelection.outputRootDir,
        inputAudioIsDefault: true,
        outputRootDirIsDefault: preferredOutputRootSelection.outputRootDirIsDefault,
        trainingOverrides: {
          ...defaultJobSpec.trainingOverrides,
          epochs: fallbackPreset?.values.epochs ?? defaultJobSpec.trainingOverrides.epochs
        },
        metadata: {
          ...defaultJobSpec.metadata,
          name: outputStem
        }
      }, settings)
      const newJob = await window.namBot.jobs.createDraft(draftInput) as JobSpec
      createdJobs.push(newJob)
    }

    if (createdJobs.length > 0) {
      setDrafts((prev) => [...prev, ...createdJobs])
      setSearch('')
    }
  }

  const handleBatchFromTemplate = (job: JobSpec): void => {
    batchTemplateRef.current = {
      kind: 'draft',
      template: job
    }
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = ''
      batchFileInputRef.current.click()
    }
  }

  const handleUseRuntimeAsTemplate = (runtime: JobRuntimeState): void => {
    batchTemplateRef.current = {
      kind: 'runtime',
      template: runtime.frozenJob,
      runtimeId: runtime.jobId
    }
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = ''
      batchFileInputRef.current.click()
    }
  }

  const handleCreateDraftFromRuntime = async (runtime: JobRuntimeState): Promise<void> => runAction('Create draft', async () => {
    const newJob = await window.namBot.jobs.createDraft(buildDraftFromFrozenJob(runtime.frozenJob)) as JobSpec
    setDrafts((prev) => [...prev, newJob])
    setSearch('')
  })

  const handleBatchFilesSelected = async (files: FileList | null): Promise<void> => {
    const source = batchTemplateRef.current
    batchTemplateRef.current = null

    if (!source || !files) {
      return
    }

    const audioFiles = Array.from(files).filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      return
    }

    await openBatchEditor(audioFiles, source)
  }

  const handleSaveJob = async (job: JobSpec) => {
    if (job.id === VIRTUAL_NEW_JOB_ID) {
      // Create a new draft on the backend (omitting the virtual ID)
      const { id: _unused, ...specWithoutId } = job
      const created = await window.namBot.jobs.createDraft(specWithoutId) as JobSpec
      setDrafts((prev) => [...prev, created])
    } else {
      // Save existing draft
      const updated = await window.namBot.jobs.saveDraft(job) as JobSpec
      setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft))
    }
    clearJobEditorSession()
    setSearch('')
  }

  const handleSaveBatch = async (job: JobSpec): Promise<void> => {
    if (!batchEditorState) {
      return
    }

    const batchId = batchEditorState.batchId
    const batchSourceName = job.name.trim() || 'Batch Training'
    const sharedMetadataName = job.metadata.name?.trim() || ''
    const template: JobSpec = {
      ...job,
      batchId,
      batchSourceName,
      metadata: {
        ...job.metadata,
        name: sharedMetadataName
      }
    }

    const draftInputs = batchEditorState.outputFiles.map((outputFile) => (
      buildDraftFromTemplateForOutput({
        template,
        outputAudioPath: outputFile.outputAudioPath,
        outputFileName: outputFile.outputFileName,
        batchId,
        batchSourceName,
        useSharedMetadataName: sharedMetadataName.length > 0
      })
    ))

    await window.namBot.jobs.createDraftBatch({
      batchId,
      batchSourceName,
      drafts: draftInputs,
      source: batchEditorState.source?.kind === 'draft'
        ? { kind: 'draft', id: batchEditorState.source.template.id }
        : batchEditorState.source?.kind === 'runtime'
          ? { kind: 'runtime', id: batchEditorState.source.runtimeId }
          : null
    })

    setBatchEditorState(null)
    setSearch('')
    await loadData()
  }

  const handleDeleteJob = async (jobId: string): Promise<void> => runAction('Delete draft', async () => {
    await window.namBot.jobs.deleteDraft(jobId)
    setDrafts((current) => current.filter((draft) => draft.id !== jobId))
    setPendingDeleteJob(null)
    setSkipDraftDeleteConfirm(false)
    if (jobEditorSession?.job.id === jobId) {
      clearJobEditorSession()
    }
  })

  const handleRequestDeleteJob = (job: JobSpec): void => {
    if (window.localStorage.getItem(SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY) === 'true') {
      void handleDeleteJob(job.id)
      return
    }

    setSkipDraftDeleteConfirm(false)
    setPendingDeleteJob(job)
  }

  const handleEnqueue = async (jobId: string) => {
    if (!markDraftQueueing(jobId)) {
      return
    }

    const job = drafts.find(d => d.id === jobId)
    if (job && (!job.name.trim() || !job.inputAudioPath.trim() || !job.outputAudioPath.trim() || !job.outputRootDir.trim())) {
      clearDraftQueueing(jobId)
      setQueueError('Cannot queue job: Some required fields are missing. Please Edit the job first.')
      return
    }

    try {
      await window.namBot.jobs.enqueue(jobId)
      await loadData()
      setQueueError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQueueError(`Queue failed: ${message}`)
    } finally {
      clearDraftQueueing(jobId)
    }
  }

  const handleQueueAll = async () => {
    if (isFiltering || drafts.length === 0 || queueingDraftIdsRef.current.size > 0) {
      return
    }

    const validDrafts = drafts.filter(job => 
      job.name.trim() && job.inputAudioPath.trim() && job.outputAudioPath.trim() && job.outputRootDir.trim()
    )

    if (validDrafts.length === 0) {
      setQueueError('Cannot queue: No valid jobs found. Make sure all jobs have a name, input/output audio, and root directory.')
      return
    }

    const skippedCount = drafts.length - validDrafts.length
    const validDraftIds = validDrafts.map((draft) => draft.id)
    setManyDraftsQueueing(validDraftIds)

    try {
      await window.namBot.jobs.enqueueMany(validDraftIds)
      await loadData()
      if (skippedCount > 0) {
        setQueueError(`Queued ${validDrafts.length} jobs. ${skippedCount} jobs were skipped because they are missing required fields.`)
      } else {
        setQueueError(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQueueError(`Queue failed: ${message}`)
    } finally {
      clearManyDraftsQueueing(validDraftIds)
    }
  }

  const handleUnqueue = async (jobId: string): Promise<void> => runAction('Unqueue', async () => {
    await window.namBot.jobs.unqueue(jobId)
    await loadData()
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDraftDragEnd = async (event: DragEndEvent): Promise<void> => runAction('Reorder drafts', async () => {
    if (isFiltering) return
    const { active, over } = event

    if (over && active.id !== over.id) {
      const visualDrafts = [...drafts].reverse()
      const oldIndex = visualDrafts.findIndex((draft) => draft.id === active.id)
      const newIndex = visualDrafts.findIndex((draft) => draft.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedVisualDrafts = arrayMove(visualDrafts, oldIndex, newIndex)
        const nextLogicalDrafts = [...updatedVisualDrafts].reverse()
        setDrafts(nextLogicalDrafts)
        try {
          await window.namBot.jobs.reorderDrafts(nextLogicalDrafts.map((draft) => draft.id))
        } catch (error) {
          await loadData()
          throw error
        }
      }
    }
  })

  const handleQueueDragEnd = async (event: DragEndEvent): Promise<void> => runAction('Reorder queue', async () => {
    if (isFiltering) return
    const { active, over } = event

    if (over && active.id !== over.id) {
      const queuedJobs = queue.filter((runtime) => runtime.status === 'queued' || runtime.status === 'validating')
      const reversedQueued = [...queuedJobs].reverse()
      const oldIndex = reversedQueued.findIndex((j) => j.jobId === active.id)
      const newIndex = reversedQueued.findIndex((j) => j.jobId === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedReversed = arrayMove(reversedQueued, oldIndex, newIndex)
        const newLogicalOrder = [...updatedReversed].reverse()
        
        // Optimistic update
        const otherJobs = queue.filter((runtime) => runtime.status !== 'queued' && runtime.status !== 'validating')
        setQueue([...otherJobs.filter(j => isActiveRuntime(j.status)), ...newLogicalOrder, ...otherJobs.filter(j => isFinishedTraining(j))])
        
        try {
          await window.namBot.jobs.reorder(newLogicalOrder.map(j => j.jobId))
        } catch (error) {
          await loadData()
          throw error
        }
      }
    }
  })

  const handleUnqueueAll = async (): Promise<void> => runAction('Unqueue all', async () => {
    if (isFiltering) return
    await window.namBot.jobs.unqueueAll()
    await loadData()
  })

  const handleCancel = async (jobId: string): Promise<void> => {
    setPendingStopJobId(jobId)
  }

  const handleForceStop = async (jobId: string): Promise<void> => runAction('Force stop', async () => {
    await window.namBot.jobs.forceStop(jobId)
  })

  const handleExportModel = async (jobId: string, finishAfterExport = false): Promise<void> => {
    setExportingJobId(jobId)
    try {
      await runAction(finishAfterExport ? 'Save and stop training' : 'Save snapshot', async () => {
        await window.namBot.jobs.exportModel(jobId, finishAfterExport)
      })
    } finally {
      setExportingJobId(null)
    }
  }

  const handleDuplicate = async (jobId: string): Promise<void> => runAction('Copy draft', async () => {
    const newJob = await window.namBot.jobs.duplicate(jobId) as JobSpec | null
    if (newJob) {
      setDrafts((prev) => [...prev, newJob])
      setSearch('')
    }
  })

  const handleClearFinished = async (): Promise<void> => runAction('Clear finished jobs', async () => {
    if (isFiltering) return
    await window.namBot.jobs.clearFinished()
    await loadData()
  })

  const handleClearItem = async (jobId: string): Promise<void> => runAction('Clear job', async () => {
    await window.namBot.jobs.clearItem(jobId)
    setExpandedJobs((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    setOpenLogs((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    clearTerminalLog(jobId)
    await loadData()
  })

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs((current) => ({
      ...current,
      [jobId]: !current[jobId]
    }))
  }

  const toggleLogs = async (jobId: string) => {
    const isOpen = openLogs[jobId] === true
    if (isOpen) {
      setOpenLogs((current) => ({ ...current, [jobId]: false }))
      return
    }
    await loadTerminalLog(jobId)
    setOpenLogs((current) => ({ ...current, [jobId]: true }))
  }

  const matchesJob = (job: JobSpec, presetName: string, runtimeName = job.name): boolean => !isFiltering
    || [runtimeName, job.name, job.metadata.name, job.batchSourceName, presetName, job.inputAudioPath, job.outputAudioPath]
      .some(value => value?.toLocaleLowerCase().includes(searchQuery))
  const matchesRuntime = (runtime: JobRuntimeState): boolean => matchesJob(runtime.frozenJob,
    runtime.frozenPreset?.name ?? presets.find(preset => preset.id === runtime.frozenJob.presetId)?.name ?? '', runtime.jobName)
  const queuedJobs = queue.filter((runtime) => runtime.status === 'queued' || runtime.status === 'validating')
  const visualDrafts = drafts.filter(job => matchesJob(job, presets.find(preset => preset.id === job.presetId)?.name ?? '')).reverse()
  const visualQueuedJobs = queuedJobs.filter(matchesRuntime).reverse()
  const trainingJobs = [...queue.filter((runtime) => isActiveRuntime(runtime.status))]
    .sort((left, right) => Date.parse(right.startedAt || right.queuedAt || '0') - Date.parse(left.startedAt || left.queuedAt || '0'))
  const finishedJobs = [...queue.filter((runtime) => isFinishedTraining(runtime))]
    .sort((left, right) => {
      return Date.parse(right.finishedAt || right.startedAt || right.queuedAt || '0') - Date.parse(left.finishedAt || left.startedAt || left.queuedAt || '0')
    })
  const visibleTrainingJobs = trainingJobs.filter(matchesRuntime)
  const visibleFinishedJobs = finishedJobs.filter(matchesRuntime)
  const hasMatches = visualDrafts.length + visualQueuedJobs.length + visibleTrainingJobs.length + visibleFinishedJobs.length > 0

  const isEmpty = drafts.length === 0 && queue.length === 0
  const isAnyDraftQueueing = queueingDraftIds.size > 0

  if (batchEditorState) {
    return (
      <JobEditor
        session={batchEditorState.editorSession}
        settings={settings}
        presets={presets}
        onSessionChange={(editorSession) => setBatchEditorState({ ...batchEditorState, editorSession })}
        onSave={handleSaveBatch}
        onCancel={() => setBatchEditorState(null)}
        batchOutputFiles={batchEditorState.outputFiles}
        saveLabel="Create Batch"
        allowSaveWithoutChanges
      />
    )
  }

  if (jobEditorSession) {
    return (
      <JobEditor
        session={jobEditorSession}
        settings={settings}
        presets={presets}
        onSessionChange={setJobEditorSession}
        onSave={handleSaveJob}
        onCancel={clearJobEditorSession}
      />
    )
  }

  return (
    <div className="layout-main feature-workspace jobs-workspace">
      <WorkspaceToolbar title="Jobs">
        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>Add audio files</button>
        <button className="btn btn-green" onClick={() => void handleCreateJob()}>New Job</button>
      </WorkspaceToolbar>
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept={AUDIO_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files
          if (files) void runAction('Import audio', () => handleDropFiles(files))
          e.target.value = ''
        }}
      />
      <div className="feature-summary-strip" aria-label="Job sections">
        {[
          { id: 'drafts', label: 'Drafts', count: visualDrafts.length },
          { id: 'queue', label: 'Queue', count: visualQueuedJobs.length },
          { id: 'training', label: 'Training', count: visibleTrainingJobs.length },
          { id: 'finished', label: 'Finished', count: visibleFinishedJobs.length }
        ].map(section => (
          <button key={section.id} disabled={section.count === 0}
            onClick={() => document.getElementById(`jobs-${section.id}`)?.scrollIntoView({ block: 'start' })}>
            <span>{section.label}</span><strong>{section.count}</strong>
          </button>
        ))}
        <label className="library-search">
          <span className="sr-only">Search jobs</span>
          <input type="search" placeholder="Search jobs…" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
      </div>
      <div
        className={`panel drop-zone-panel jobs-drop-target${isDragOver ? ' drop-zone-active' : ''}`}
        style={{ position: 'relative' }}
        onDragOver={(event) => { event.preventDefault(); setIsDragOver(true) }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragOver(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          void runAction('Import audio', () => handleDropFiles(event.dataTransfer.files))
        }}
      >
        <input
          type="file"
          ref={batchFileInputRef}
          multiple
          accept={AUDIO_FILE_ACCEPT}
          style={{ display: 'none' }}
          onChange={(event) => {
            void runAction('Select batch files', () => handleBatchFilesSelected(event.target.files))
            event.target.value = ''
          }}
        />

        {isDragOver && (
          <div className="drop-overlay">
            <div className="drop-zone-empty">
              <h3>Drop output audio files</h3>
              <p>Release to create draft jobs from the files you dropped.</p>
            </div>
          </div>
        )}

        {jobsLoadError && <p role="alert">Could not load jobs: {jobsLoadError} <button className="btn btn-sm btn-secondary" onClick={() => void loadJobs()}>Retry</button></p>}
        {presetWarnings.map((warning) => <p role="status" key={warning} style={{ color: 'var(--neon-gold)' }}>{warning}</p>)}
        {(queueControl.pauseReason || (queuedJobs.length > 0 && trainingJobs.length === 0)) && (
          <div className="queue-recovery-banner" role="status">
            <p>{queueControl.pauseReason === 'termination_unconfirmed'
              ? 'Queue paused: the previous training process may still be running. Confirm it has stopped before resuming.'
              : queueControl.pauseReason === 'restart'
                ? 'Your pending jobs were restored. Resume the queue when you are ready.'
                : queuedJobs.some((runtime) => runtime.errorCategory === 'a2_diagnostics_pending')
                  ? 'Training is waiting for Diagnostics to confirm this environment.'
                  : 'The queue is idle. Start the waiting jobs when you are ready.'}</p>
            <button className="btn btn-sm btn-green" onClick={() => void handleResumeQueue()}>Resume Queue</button>
          </div>
        )}

        {queueError && (
          <div role="alert" style={{ marginBottom: '12px', padding: '10px 12px', border: '2px solid var(--neon-magenta)', color: 'var(--neon-magenta)' }}>
            {queueError}
          </div>
        )}

        {isFiltering && (
          <div className="jobs-search-status" role="status">
            <span>{visualDrafts.length + visualQueuedJobs.length + visibleTrainingJobs.length + visibleFinishedJobs.length} of {drafts.length + queue.length} jobs</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setSearch('')}>Clear search</button>
          </div>
        )}
        {isEmpty ? (
          <div className="drop-zone-empty jobs-empty">
            <div className="drop-zone-icon-container">
              <svg width="38" height="30" viewBox="0 0 48 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 2H4C2.9 2 2.01 2.9 2.01 4L2 34C2 35.1 2.9 36 4 36H44C45.1 36 46 35.1 46 34V8C46 6.9 45.1 6 44 6H22L18 2Z" fill="var(--neon-gold)" />
              </svg>
            </div>
            <h2 className="drop-zone-headline">Drop output audio files</h2>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '18px', padding: '10px 20px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              CLICK TO BROWSE FILES
            </button>
          </div>
        ) : !hasMatches ? (
          <div className="library-empty">No matching jobs.</div>
        ) : (
          <div className="job-sections">
            {visualDrafts.length > 0 && (
              <div className="job-list jobs-section" id="jobs-drafts">
              <div className="panel-header" style={{ marginBottom: '0px' }}>
                <h3>Drafts ({visualDrafts.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleQueueAll()} disabled={isFiltering || isAnyDraftQueueing} title={isFiltering ? 'Clear search to queue all drafts' : undefined}>
                  {isAnyDraftQueueing ? 'Queueing...' : 'Queue All'}
                  <WorkingIndicator active={isAnyDraftQueueing} />
                </button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDraftDragEnd}
              >
                <SortableContext
                  items={visualDrafts.map((job) => job.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visualDrafts.map((job) => (
                    <SortableDraftItem
                      key={job.id}
                      id={job.id}
                      reorderDisabled={isFiltering}
                      job={job}
                      presets={presets}
                      onEdit={(j) => setJobEditorSession(buildJobEditorSession('Edit Job', j, settings))}
                      onQueue={handleEnqueue}
                      onDuplicate={handleDuplicate}
                      onBatchFromTemplate={handleBatchFromTemplate}
                      onDelete={handleRequestDeleteJob}
                      isQueueing={queueingDraftIds.has(job.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              </div>
            )}

            {visualQueuedJobs.length > 0 && (
              <div className="jobs-section" id="jobs-queue">
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Queue ({visualQueuedJobs.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleUnqueueAll()} disabled={isFiltering} title={isFiltering ? 'Clear search to unqueue all jobs' : undefined}>
                  Unqueue All
                </button>
              </div>
              <div className="job-list">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleQueueDragEnd}
                >
                  <SortableContext
                    items={visualQueuedJobs.map(job => job.jobId)}
                    strategy={verticalListSortingStrategy}
                  >
                    {visualQueuedJobs.map((runtime) => (
                      <SortableQueueItem
                        key={runtime.jobId}
                        runtime={runtime}
                        queue={queuedJobs} // Logical queue for index calculation
                        presets={presets}
                        index={queuedJobs.findIndex(job => job.jobId === runtime.jobId)}
                        reorderDisabled={isFiltering}
                        onUnqueue={handleUnqueue}
                        onBatchFromRuntime={handleUseRuntimeAsTemplate}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
              </div>
            )}

            {visibleTrainingJobs.length > 0 && (
              <div className="jobs-section" id="jobs-training">
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Training ({visibleTrainingJobs.length})</h3>
              </div>
              <div className="job-list">
                {visibleTrainingJobs.map((runtime) => {
                  return (
                    <RuntimeCard
                      key={runtime.jobId}
                      runtime={runtime}
                      presets={presets}
                      nowMs={nowMs}
                      isExpanded={expandedJobs[runtime.jobId] === true}
                      isLogsVisible={openLogs[runtime.jobId] === true}
                      terminalLog={logErrors[runtime.jobId] || logContents[runtime.jobId] || ''}
                      isLoadingLog={loadingLogIds.has(runtime.jobId)}
                      onToggleExpanded={toggleExpanded}
                      onToggleLogs={(entry) => toggleLogs(entry.jobId)}
                      onCancel={handleCancel}
                      onExportModel={handleExportModel}
                      isExporting={exportingJobId === runtime.jobId}
                      onForceStop={handleForceStop}
                      onCreateDraftFromRuntime={handleCreateDraftFromRuntime}
                      onUseRuntimeAsTemplate={handleUseRuntimeAsTemplate}
                      onOpenFolder={async (jobId) => { await window.namBot.jobs.openResultFolder(jobId) }}
                      onOpenArtifact={async (jobId, target) => { await window.namBot.jobs.openArtifact(jobId, target) }}
                      onClearFinished={handleClearItem}
                    />
                  )
                })}
              </div>
              </div>
            )}

            {visibleFinishedJobs.length > 0 && (
              <div className="jobs-section" id="jobs-finished">
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Finished ({visibleFinishedJobs.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleClearFinished()} disabled={isFiltering} title={isFiltering ? 'Clear search to clear all finished jobs' : undefined}>
                  Clear Finished
                </button>
              </div>
              <div className="job-list">
                {visibleFinishedJobs.map((runtime) => {
                  return (
                    <RuntimeCard
                      key={runtime.jobId}
                      runtime={runtime}
                      presets={presets}
                      nowMs={nowMs}
                      isExpanded={expandedJobs[runtime.jobId] === true}
                      isLogsVisible={openLogs[runtime.jobId] === true}
                      terminalLog={logErrors[runtime.jobId] || logContents[runtime.jobId] || ''}
                      isLoadingLog={loadingLogIds.has(runtime.jobId)}
                      onToggleExpanded={toggleExpanded}
                      onToggleLogs={(entry) => toggleLogs(entry.jobId)}
                      onCancel={handleCancel}
                      onExportModel={handleExportModel}
                      isExporting={exportingJobId === runtime.jobId}
                      onForceStop={handleForceStop}
                      onCreateDraftFromRuntime={handleCreateDraftFromRuntime}
                      onUseRuntimeAsTemplate={handleUseRuntimeAsTemplate}
                      onOpenFolder={async (jobId) => { await window.namBot.jobs.openResultFolder(jobId) }}
                      onOpenArtifact={async (jobId, target) => { await window.namBot.jobs.openArtifact(jobId, target) }}
                      onClearFinished={handleClearItem}
                    />
                  )
                })}
              </div>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmResume}
        title="Confirm Previous Training Stopped"
        message="NAM-BOT could not confirm termination. Check your system's process manager and stop the previous trainer before resuming."
        confirmLabel="Process Stopped — Resume"
        onCancel={() => setConfirmResume(false)}
        onConfirm={() => void handleResumeQueue(true)}
      />
      <ConfirmDialog
        isOpen={pendingDeleteJob !== null}
        title="Delete Draft Job"
        message={pendingDeleteJob
          ? `Delete "${pendingDeleteJob.name}"? This removes the draft from NAM-BOT, but it does not delete any audio files on disk.`
          : ''}
        confirmLabel="Delete"
        checkboxLabel="Don't show this again"
        checkboxChecked={skipDraftDeleteConfirm}
        onCheckboxChange={setSkipDraftDeleteConfirm}
        onCancel={() => {
          setSkipDraftDeleteConfirm(false)
          setPendingDeleteJob(null)
        }}
        onConfirm={() => {
          if (!pendingDeleteJob) {
            return
          }
          if (skipDraftDeleteConfirm) {
            window.localStorage.setItem(SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY, 'true')
          }
          void handleDeleteJob(pendingDeleteJob.id)
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingStopJob)}
        title="Stop training?"
        message={pendingStopJob && canExportTrainingModel(pendingStopJob)
          ? 'Save & stop exports the best validated weights for every embedded model, then finishes training cleanly. Discard & stop ends training immediately without a new export. Existing exports and checkpoints are kept.'
          : 'There is no exportable checkpoint yet, or an export is already in progress. You can keep training or stop immediately without a new export. Existing exports and checkpoints are kept.'}
        confirmLabel="Save & stop"
        confirmClassName="btn btn-green"
        confirmDisabled={!pendingStopJob || !canExportTrainingModel(pendingStopJob) || exportingJobId !== null}
        alternateLabel="Discard & stop"
        alternateClassName="btn btn-orange"
        cancelLabel="Keep training"
        onCancel={() => setPendingStopJobId(null)}
        onConfirm={() => {
          if (!pendingStopJob) return
          const id = pendingStopJob.jobId
          setPendingStopJobId(null)
          void handleExportModel(id, true)
        }}
        onAlternate={() => {
          if (!pendingStopJob) return
          const id = pendingStopJob.jobId
          setPendingStopJobId(null)
          void handleForceStop(id)
        }}
      />
    </div>
  )
}

function JobEditor({
  session,
  settings,
  presets,
  onSessionChange,
  onSave,
  onCancel,
  batchOutputFiles,
  saveLabel = 'Save Job',
  allowSaveWithoutChanges = false
}: {
  session: JobEditorSession
  settings: AppSettings | null
  presets: TrainingPresetFile[]
  onSessionChange: (session: JobEditorSession) => void
  onSave: (job: JobSpec) => Promise<void> | void
  onCancel: () => void
  batchOutputFiles?: BatchOutputFile[]
  saveLabel?: string
  allowSaveWithoutChanges?: boolean
}) {
  const { title, job, inputMode, outputRootMode, showValidationErrors } = session
  const editedJob = job
  const isBatchMode = !!batchOutputFiles && batchOutputFiles.length > 0
  const [defaultAudioPath, setDefaultAudioPath] = useState<string | null>(null)
  const [savingDefault, setSavingDefault] = useState(false)
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveInFlightRef = useRef(false)
  const settingsDefaultOutputRoot = settings?.defaultOutputRoot?.trim() || null
  const visiblePresets = useMemo(
    () => presets.filter((preset) => preset.visible || preset.id === editedJob.presetId),
    [editedJob.presetId, presets]
  )
  const selectedPreset = visiblePresets.find((preset) => preset.id === editedJob.presetId)
  const displayedEpochs = selectedPreset ? getEffectiveJobEpochs(editedJob, selectedPreset) : editedJob.trainingOverrides.epochs ?? 100
  const displayedLatency = selectedPreset ? getEffectiveJobLatency(editedJob, selectedPreset) : editedJob.trainingOverrides.latencySamples ?? 0
  const epochsLocked = selectedPreset?.lockedJobFields.includes('epochs') ?? false
  const latencyLocked = selectedPreset?.lockedJobFields.includes('latencySamples') ?? false
  const latencyMode = editedJob.trainingOverrides?.latencyMode ?? 'manual'
  const latencyInputDisabled = latencyLocked || latencyMode === 'auto'
  const packedSubmodelOptions = useMemo(
    () => selectedPreset ? getPackedSubmodelsForPreset(selectedPreset) : [],
    [selectedPreset]
  )
  const showPackedSubmodelSelector = packedSubmodelOptions.length >= 3
  const effectivePackedSubmodels = showPackedSubmodelSelector
    ? (editedJob.trainingOverrides.packedSubmodels ?? packedSubmodelOptions.map(toPackedSubmodelSelection))
    : []
  const selectedPackedSubmodelKeys = new Set(effectivePackedSubmodels.map(getPackedSubmodelSelectionKey))
  const selectedPackedSubmodelOptionCount = packedSubmodelOptions.filter((submodel) => (
    selectedPackedSubmodelKeys.has(getPackedSubmodelSelectionKey(toPackedSubmodelSelection(submodel)))
  )).length
  const isPackedSubmodelSelectionValid = !showPackedSubmodelSelector || selectedPackedSubmodelOptionCount > 0

  // Auto-sync output root dir when following the output-audio directory mode.
  useEffect(() => {
    if (outputRootMode === 'output-audio' && editedJob.outputAudioPath) {
      const dir = getDirname(editedJob.outputAudioPath)
      if (dir !== editedJob.outputRootDir) {
        onSessionChange({
          ...session,
          job: { ...editedJob, outputRootDir: dir }
        })
      }
    }
  }, [editedJob, onSessionChange, outputRootMode, session])

  useEffect(() => {
    if (outputRootMode === 'settings-default') {
      if (settingsDefaultOutputRoot && editedJob.outputRootDir !== settingsDefaultOutputRoot) {
        onSessionChange({
          ...session,
          job: {
            ...editedJob,
            outputRootDir: settingsDefaultOutputRoot,
            outputRootDirIsDefault: false
          }
        })
        return
      }

      if (!settingsDefaultOutputRoot) {
        onSessionChange({
          ...session,
          outputRootMode: 'output-audio',
          job: {
            ...editedJob,
            outputRootDirIsDefault: true,
            outputRootDir: editedJob.outputAudioPath ? getDirname(editedJob.outputAudioPath) : ''
          }
        })
      }
    }
  }, [editedJob, onSessionChange, outputRootMode, session, settingsDefaultOutputRoot])

  useEffect(() => {
    let mounted = true
    void window.namBot.jobs.getDefaultInputAudioPath().then((path) => {
      if (mounted) setDefaultAudioPath(path)
    }).catch((error: unknown) => {
      if (mounted) setSaveError(`Could not find the default training signal: ${String(error)}`)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (inputMode === 'default' && defaultAudioPath && editedJob.inputAudioPath !== defaultAudioPath) {
      onSessionChange({ ...session, job: { ...editedJob, inputAudioPath: defaultAudioPath, inputAudioIsDefault: true } })
    }
  }, [defaultAudioPath, inputMode, editedJob, onSessionChange, session])

  const handleInputModeChange = (mode: JobInputAudioMode): void => {
    if (mode === 'default') {
      onSessionChange({
        ...session,
        inputMode: mode,
        job: { ...editedJob, inputAudioPath: defaultAudioPath || '', inputAudioIsDefault: true }
      })
    } else {
      onSessionChange({
        ...session,
        inputMode: mode,
        job: { ...editedJob, inputAudioPath: '', inputAudioIsDefault: false }
      })
    }
  }

  const handleSaveDefaultAudio = async () => {
    setSavingDefault(true)
    try {
      await window.namBot.jobs.saveDefaultAudioTo()
    } catch (error) {
      setSaveError(`Could not export the training signal: ${String(error)}`)
    } finally {
      setSavingDefault(false)
    }
  }

  const outputFilenameStem = filenameWithoutExt(editedJob.outputAudioPath).trim()
  const previewNames = isBatchMode
    ? batchOutputFiles.map(file => filenameWithoutExt(file.outputFileName || file.outputAudioPath).trim() || 'New Job')
    : editedJob.name.trim() ? [editedJob.name] : []
  const modelFilenamePreviews = previewNames.map(name => buildModelFilename({ ...editedJob, name }, selectedPreset?.name, 'pending'))


  const isNameValid = editedJob.name.trim().length > 0
  const isInputValid = editedJob.inputAudioPath.trim().length > 0
  const isOutputValid = editedJob.outputAudioPath.trim().length > 0
  const isRootDirValid = editedJob.outputRootDir.trim().length > 0
  const isValid = isNameValid && isInputValid && isOutputValid && isRootDirValid && isPackedSubmodelSelectionValid && selectedPreset != null
  const isDirty = session.initialSnapshot !== serializeJobEditorSession(session)
  const canSave = (allowSaveWithoutChanges || isDirty) && isValid

  const performSave = async (): Promise<void> => {
    if (saveInFlightRef.current) {
      return
    }
    if (!isValid) {
      onSessionChange({
        ...session,
        showValidationErrors: true
      })
      return Promise.resolve()
    }
    saveInFlightRef.current = true
    setIsSaving(true)
    setSaveError(null)
    try {
      if (editedJob.presetId) {
        window.localStorage.setItem(LAST_USED_PRESET_STORAGE_KEY, editedJob.presetId)
      }
      window.localStorage.setItem(
        LAST_APPEND_PRESET_NAME_STORAGE_KEY,
        editedJob.appendPresetToModelFileName ? 'true' : 'false'
      )
      window.localStorage.setItem(
        LAST_APPEND_ESR_STORAGE_KEY,
        editedJob.appendEsrToModelFileName ? 'true' : 'false'
      )
      window.localStorage.setItem(
        LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
        editedJob.copyFinalModelToOutputAudioFolder ? 'true' : 'false'
      )
      persistOutputRootPreference(outputRootMode, editedJob.outputRootDir)
      persistReusableJobDefaults(editedJob, inputMode)
      await Promise.resolve(onSave(editedJob))
    } catch (error) {
      setSaveError(`Could not save ${isBatchMode ? 'batch' : 'job'}: ${error instanceof Error ? error.message : String(error)}. Your edits are still here; retry when the problem is resolved.`)
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await performSave()
  }

  const updateMeta = (patch: Partial<NamEmbeddedMetadata>) => {
    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        metadata: { ...editedJob.metadata, ...patch }
      }
    })
  }

  const updatePackedSubmodelSelection = (submodel: PackedPresetSubmodel, checked: boolean): void => {
    const submodelSelection = toPackedSubmodelSelection(submodel)
    const submodelKey = getPackedSubmodelSelectionKey(submodelSelection)
    const currentSelections = effectivePackedSubmodels
    const currentKeys = new Set(currentSelections.map(getPackedSubmodelSelectionKey))

    if (checked) {
      currentKeys.add(submodelKey)
    } else if (selectedPackedSubmodelOptionCount > 1) {
      currentKeys.delete(submodelKey)
    } else {
      return
    }

    const nextSelections = packedSubmodelOptions
      .map(toPackedSubmodelSelection)
      .filter((selection) => currentKeys.has(getPackedSubmodelSelectionKey(selection)))
    const packedOverride = nextSelections.length === packedSubmodelOptions.length ? undefined : nextSelections

    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        trainingOverrides: withPackedSubmodelSelection(editedJob.trainingOverrides, packedOverride)
      }
    })
  }

  const updateLatencyMode = (nextMode: JobLatencyMode): void => {
    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        trainingOverrides: {
          ...editedJob.trainingOverrides,
          latencyMode: nextMode,
          latencySamples: editedJob.trainingOverrides?.latencySamples ?? 0
        }
      }
    })
  }

  const handleAttemptExit = (): void => {
    if (!isDirty && !isBatchMode) {
      onCancel()
      return
    }

    setIsUnsavedConfirmOpen(true)
  }

  const handleSaveAndExit = async (): Promise<void> => {
    if (!canSave) {
      return
    }

    await performSave()
    setIsUnsavedConfirmOpen(false)
  }

  return (
    <PropertySheet sections={JOB_EDITOR_SECTIONS} navigationLabel="Job editor sections" className="job-editor-workspace">
      <div className="panel editor-sheet">
        <WorkspaceToolbar title={title}>
          <button
            type="submit"
            form={JOB_EDITOR_FORM_ID}
            className={`btn btn-sm ${canSave ? 'btn-green' : 'btn-secondary'}`}
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Saving...' : saveLabel}
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={handleAttemptExit} disabled={isSaving}>
            Cancel
          </button>
        </WorkspaceToolbar>

        {saveError && <p role="alert" className="operation-error">{saveError}</p>}
        {!selectedPreset && <p role="alert" className="operation-error">The selected preset is unavailable. Choose an available preset before saving this job.</p>}
        <form className="workspace-editor-form" id={JOB_EDITOR_FORM_ID} onSubmit={handleSubmit}>

          <section className="property-section" aria-labelledby="job-audio-heading">
            <h2 id="job-audio-heading" tabIndex={-1}>Name & audio</h2>
            <div className="property-row">
              <label className="form-label" htmlFor="job-name">
                {isBatchMode ? 'Batch Label' : 'Job Name'} {showValidationErrors && !isNameValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
              </label>
              <div className="property-control">
                <div className="property-input-action">
                  <input
                    id="job-name"
                    type="text"
                    className={`form-input${showValidationErrors && !isNameValid ? ' input-error' : ''}`}
                    style={showValidationErrors && !isNameValid ? { borderColor: 'var(--neon-magenta)' } : {}}
                    value={editedJob.name}
                    onChange={(e) => onSessionChange({
                      ...session,
                      job: { ...editedJob, name: e.target.value }
                    })}
                  />
                  {!isBatchMode && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      disabled={!outputFilenameStem}
                      onClick={() => onSessionChange({
                        ...session,
                        job: { ...editedJob, name: outputFilenameStem }
                      })}
                    >
                      Use Output Filename
                    </button>
                  )}
                </div>
                {isBatchMode && (
                  <p className="property-hint">
                    Generated drafts still use each output filename as their job name. This label identifies the batch.
                  </p>
                )}
              </div>
            </div>
            <div className="property-row">
              <label className="form-label" htmlFor="input-audio-path">
                Input Audio <span className="job-label-detail">(Training Signal)</span>
                {showValidationErrors && !isInputValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
              </label>
              <div className="property-control">
                {/* Toggle buttons */}
                <div className="toggle-group job-mode-controls" role="group" aria-label="Input audio source">
                  <button
                    type="button"
                    className={`btn btn-sm ${inputMode === 'default' ? 'btn-green' : 'btn-secondary'}`}
                    aria-pressed={inputMode === 'default'}
                    onClick={() => handleInputModeChange('default')}
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${inputMode === 'custom' ? 'btn-blue' : 'btn-secondary'}`}
                    aria-pressed={inputMode === 'custom'}
                    onClick={() => handleInputModeChange('custom')}
                  >
                    Custom
                  </button>
                  {inputMode === 'default' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={handleSaveDefaultAudio}
                      disabled={savingDefault}
                      title="Save the bundled v3_0_0.wav training signal to your system"
                    >
                      {savingDefault ? 'Saving...' : 'Save Default to Disk'}
                    </button>
                  )}
                </div>

                <FilePickerRow
                  id="input-audio-path"
                  value={editedJob.inputAudioPath}
                  displayValue={getBasename(editedJob.inputAudioPath)}
                  onChange={(val) => onSessionChange({
                    ...session,
                    job: { ...editedJob, inputAudioPath: val }
                  })}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\path\\to\\v3_0_0.wav' : '/path/to/v3_0_0.wav'}
                  disabled={inputMode === 'default'}
                  onBrowse={() => window.namBot.jobs.chooseAudioFile() as Promise<string | null>}
                  error={showValidationErrors && !isInputValid}
                />
              </div>
            </div>
            <div className="property-row">
              <label className="form-label" htmlFor="output-audio-path">
                {isBatchMode ? `Output Audio Files (${batchOutputFiles?.length ?? 0})` : <>Output Audio <span className="job-label-detail">(Re-amped Signal)</span></>}
                {showValidationErrors && !isOutputValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
              </label>
              <div className="property-control">
                {isBatchMode ? (
                  <div className="batch-output-list">
                    {batchOutputFiles?.map((outputFile, index) => (
                      <div className="batch-output-item" key={`${outputFile.outputAudioPath}:${index}`}>
                        <span className="batch-output-index">{index + 1}</span>
                        <span className="batch-output-name">{getBasename(outputFile.outputAudioPath) || outputFile.outputFileName}</span>
                        <span className="batch-output-path">{outputFile.outputAudioPath}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <FilePickerRow
                    id="output-audio-path"
                    value={editedJob.outputAudioPath}
                    displayValue={getBasename(editedJob.outputAudioPath)}
                    onChange={(val) => onSessionChange({
                      ...session,
                      job: { ...editedJob, outputAudioPath: val }
                    })}
                    placeholder={window.namBot.platform === 'win32' ? 'C:\\path\\to\\reamped.wav' : '/path/to/reamped.wav'}
                    onBrowse={() => window.namBot.jobs.chooseAudioFile() as Promise<string | null>}
                    error={showValidationErrors && !isOutputValid}
                  />
                )}
              </div>
            </div>

          </section>
          <section className="property-section" aria-labelledby="job-training-heading">
            <h2 id="job-training-heading" tabIndex={-1}>Training</h2>
            <div className="property-row">
              <label className="form-label" htmlFor="preset-select">Preset</label>
              <div className="property-control">
                <select
                  id="preset-select"
                  className="form-select"
                  value={selectedPreset?.id || ''}
                  onChange={(e) => {
                    const nextPreset = presets.find((preset) => preset.id === e.target.value)
                    if (!nextPreset) {
                      return
                    }
                    const currentEpochs = editedJob.trainingOverrides.epochs
                    const shouldUseNextPresetEpochs = currentEpochs == null || currentEpochs === selectedPreset?.values.epochs
                    const nextTrainingOverrides = withPackedSubmodelSelection({
                      ...editedJob.trainingOverrides,
                      epochs: shouldUseNextPresetEpochs ? nextPreset.values.epochs : currentEpochs
                    }, undefined)
                    onSessionChange({
                      ...session,
                      job: {
                        ...editedJob,
                        presetId: nextPreset.id,
                        trainingOverrides: nextTrainingOverrides
                      }
                    })
                  }}
                >
                  {!selectedPreset && <option value="" disabled>Choose an available preset</option>}
                  {visiblePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      [{formatPresetArchitectureTag(preset)}] {formatPresetNameWithRewardTag(preset)}
                    </option>
                  ))}
                </select>
                {selectedPreset && (
                  <details className="job-field-help"><summary>Preset details</summary><p className="property-hint">
                    <span className="queue-status-badge queued">{formatPresetArchitectureTag(selectedPreset)}</span> {selectedPreset.values.modelFamily} / {selectedPreset.values.architectureSize}. {selectedPreset.description}
                  </p></details>
                )}
              </div>
            </div>
            <div className="property-row">
              <label className="form-label" htmlFor="epochs">Epochs</label>
              <div className="property-control">
                <input
                  id="epochs"
                  type="number"
                  className="form-input"
                  value={displayedEpochs}
                  disabled={epochsLocked}
                  onChange={(e) => onSessionChange({
                    ...session,
                    job: {
                      ...editedJob,
                      trainingOverrides: {
                        ...editedJob.trainingOverrides,
                        epochs: Math.max(1, parseInt(e.target.value, 10) || selectedPreset?.values.epochs || 100)
                      }
                    }
                  })}
                />
                {epochsLocked && (
                  <p className="property-hint">
                    This preset locks epoch count through its expert learning config.
                  </p>
                )}
              </div>
            </div>
            <div className="property-row">
              <label className="form-label" htmlFor="latency-samples">Latency (samples)</label>
              <div className="property-control">
                <div className="job-latency-controls"><div className="toggle-group job-mode-controls" role="group" aria-label="Latency mode">
                  <button
                    type="button"
                    className={`btn btn-sm ${latencyMode === 'manual' ? 'btn-blue' : 'btn-secondary'}`}
                    disabled={latencyLocked}
                    aria-pressed={latencyMode === 'manual'}
                    onClick={() => updateLatencyMode('manual')}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${latencyMode === 'auto' ? 'btn-green' : 'btn-secondary'}`}
                    disabled={latencyLocked}
                    aria-pressed={latencyMode === 'auto'}
                    onClick={() => updateLatencyMode('auto')}
                  >
                    Auto-align
                  </button>
                </div>
                  <input
                    id="latency-samples"
                    type="number"
                    className="form-input"
                    value={displayedLatency}
                    disabled={latencyInputDisabled}
                    onChange={(e) => onSessionChange({
                      ...session,
                      job: {
                        ...editedJob,
                        trainingOverrides: {
                          ...editedJob.trainingOverrides,
                          latencySamples: parseInt(e.target.value, 10) || 0
                        }
                      }
                    })}
                  /></div>
                <p className="property-hint">
                  {latencyMode === 'auto' ? 'Analyzes the training signal before the run and applies the measured delay.' : 'Delay in samples. Use 0 for no latency correction.'}
                </p>
                {latencyLocked && (
                  <p className="property-hint">
                    This preset locks delay through its expert data config, so NAM-BOT will not run auto-align for this job.
                  </p>
                )}
              </div>
            </div>
            {showPackedSubmodelSelector && (
              <div className="property-row"><span className="form-label" id="job-packed-models-label">Packed models</span><div className="property-control property-option-panel" role="group" aria-labelledby="job-packed-models-label">

                <p className="packed-submodel-helper">
                  Choose which model tiers to include. At least one must remain selected.
                </p>
                <div className="packed-submodel-options">
                  {packedSubmodelOptions.map((submodel) => {
                    const selection = toPackedSubmodelSelection(submodel)
                    const selectionKey = getPackedSubmodelSelectionKey(selection)
                    const isSelected = selectedPackedSubmodelKeys.has(selectionKey)
                    const isLastSelected = isSelected && selectedPackedSubmodelOptionCount === 1

                    return (
                      <label key={selectionKey} className="packed-submodel-option">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isLastSelected}
                          onChange={(event) => updatePackedSubmodelSelection(submodel, event.target.checked)}
                        />
                        <span>{formatPackedSubmodelDisplayName(submodel)}</span>
                      </label>
                    )
                  })}
                </div>
                {!isPackedSubmodelSelectionValid && (
                  <p style={{ color: 'var(--neon-magenta)', fontSize: '12px', marginBottom: 0 }}>
                    Select at least one packed submodel.
                  </p>
                )}
              </div></div>
            )}


          </section>
          <section className="property-section" aria-labelledby="job-model-output-heading">
            <h2 id="job-model-output-heading" tabIndex={-1}>Model output</h2>
            <div className="property-row">
              <label className="form-label" htmlFor="output-root-dir">
                Output folder {showValidationErrors && !isRootDirValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
              </label>
              <div className="property-control">
                {/* Toggle buttons */}
                <div className="toggle-group job-mode-controls" role="group" aria-label="Model output folder source">
                  <button
                    type="button"
                    className={`btn btn-sm ${outputRootMode === 'settings-default' ? 'btn-green' : 'btn-secondary'}`}
                    aria-pressed={outputRootMode === 'settings-default'}
                    onClick={() => {
                      if (!settingsDefaultOutputRoot) {
                        return
                      }
                      onSessionChange({
                        ...session,
                        outputRootMode: 'settings-default',
                        job: {
                          ...editedJob,
                          outputRootDirIsDefault: false,
                          outputRootDir: settingsDefaultOutputRoot
                        }
                      })
                    }}
                    disabled={!settingsDefaultOutputRoot}
                    title={
                      settingsDefaultOutputRoot
                        ? `Use Settings > Default Model Output Root (${settingsDefaultOutputRoot})`
                        : 'Set Settings > Default Model Output Root to enable this option'
                    }
                  >
                    Settings Default
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${outputRootMode === 'output-audio' ? 'btn-blue' : 'btn-secondary'}`}
                    aria-pressed={outputRootMode === 'output-audio'}
                    onClick={() => {
                      const dir = getDirname(editedJob.outputAudioPath)
                      onSessionChange({
                        ...session,
                        outputRootMode: 'output-audio',
                        job: {
                          ...editedJob,
                          outputRootDirIsDefault: true,
                          outputRootDir: dir
                        }
                      })
                    }}
                  >
                    Output audio folder
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${outputRootMode === 'custom' ? 'btn-blue' : 'btn-secondary'}`}
                    aria-pressed={outputRootMode === 'custom'}
                    onClick={() => {
                      onSessionChange({
                        ...session,
                        outputRootMode: 'custom',
                        job: { ...editedJob, outputRootDirIsDefault: false }
                      })
                    }}
                  >
                    Custom Folder
                  </button>

                </div>


                <FilePickerRow
                  id="output-root-dir"
                  value={editedJob.outputRootDir}
                  onChange={(val) => onSessionChange({
                    ...session,
                    job: { ...editedJob, outputRootDir: val }
                  })}
                  placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\NAM\\outputs' : '/path/to/NAM/outputs'}
                  disabled={outputRootMode !== 'custom'}
                  onBrowse={() => window.namBot.settings.chooseDirectory() as Promise<string | null>}
                  error={showValidationErrors && !isRootDirValid}
                />
              </div>
            </div>
            <div className="property-row">
              <span className="form-label" id="job-file-naming-label">File naming</span>
              <div className="property-control">
                <div className="job-check-options property-option-panel" role="group" aria-labelledby="job-file-naming-label">
                  <label className="job-check-option">
                    <input
                      type="checkbox"
                      checked={editedJob.appendPresetToModelFileName}
                      onChange={(event) => {
                        window.localStorage.setItem(
                          LAST_APPEND_PRESET_NAME_STORAGE_KEY,
                          event.target.checked ? 'true' : 'false'
                        )
                        onSessionChange({
                          ...session,
                          job: {
                            ...editedJob,
                            appendPresetToModelFileName: event.target.checked
                          }
                        })
                      }}
                    />
                    <span>Append preset name</span>
                  </label>
                  <label className="job-check-option">
                    <input
                      type="checkbox"
                      checked={editedJob.appendEsrToModelFileName}
                      onChange={(event) => {
                        window.localStorage.setItem(
                          LAST_APPEND_ESR_STORAGE_KEY,
                          event.target.checked ? 'true' : 'false'
                        )
                        onSessionChange({
                          ...session,
                          job: {
                            ...editedJob,
                            appendEsrToModelFileName: event.target.checked
                          }
                        })
                      }}
                    />
                    <span>Append final ESR</span>
                  </label>
                </div>
                <div className="model-filename-preview">
                  <span id="model-filename-preview-label">{isBatchMode ? 'Filename previews' : 'Filename preview'}</span>
                  <output aria-labelledby="model-filename-preview-label" className="model-filename-output">
                    {modelFilenamePreviews.map((filename, index) => <span key={index}>{filename}</span>)}
                    {modelFilenamePreviews.length === 0 && <span className="model-filename-empty">Enter a job name</span>}
                  </output>
                </div>
              </div>
            </div>
            <div className="property-row">
              <span className="form-label">Extra copy</span>
              <div className="property-control">
                <label className="job-check-option property-option-panel">
                  <input
                    type="checkbox"
                    checked={editedJob.copyFinalModelToOutputAudioFolder}
                    onChange={(event) => {
                      window.localStorage.setItem(
                        LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
                        event.target.checked ? 'true' : 'false'
                      )
                      onSessionChange({
                        ...session,
                        job: {
                          ...editedJob,
                          copyFinalModelToOutputAudioFolder: event.target.checked
                        }
                      })
                    }}
                  />
                  <span>Copy model to output audio folder</span>
                </label>
              </div>
            </div>

          </section>
          <section className="property-section" aria-labelledby="job-metadata-heading">
            <h2 id="job-metadata-heading" tabIndex={-1}>Metadata</h2>
            <p className="property-note">Embedded in the .nam file. Model name is independent of the filename.</p>
            <div className="editor-metadata-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="meta-name">{isBatchMode ? 'Shared Model Name' : 'Model Name'}</label>
                <div className="property-input-action">
                  <input
                    id="meta-name"
                    type="text"
                    className="form-input"
                    value={editedJob.metadata?.name || ''}
                    placeholder={isBatchMode ? 'Leave blank to use each output filename' : 'e.g. My Plexi'}
                    onChange={(e) => updateMeta({ name: e.target.value })}
                  />
                  {!isBatchMode && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      disabled={!outputFilenameStem}
                      onClick={() => updateMeta({ name: outputFilenameStem })}
                    >
                      Use Output Filename
                    </button>
                  )}
                </div>
                {isBatchMode && (
                  <p className="property-hint">
                    Leave blank to embed each output filename as that model's metadata name. Type a value here only if every generated model should share the same embedded name.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-modeled-by">Modeled By</label>
                <input
                  id="meta-modeled-by"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.modeledBy || ''}
                  placeholder="Your name or handle"
                  onChange={(e) => updateMeta({ modeledBy: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-make">Gear Make</label>
                <input
                  id="meta-gear-make"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.gearMake || ''}
                  placeholder="e.g. Marshall"
                  onChange={(e) => updateMeta({ gearMake: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-model">Gear Model</label>
                <input
                  id="meta-gear-model"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.gearModel || ''}
                  placeholder="e.g. JCM800"
                  onChange={(e) => updateMeta({ gearModel: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-type">Gear Type</label>
                <select
                  id="meta-gear-type"
                  className="form-select"
                  value={editedJob.metadata?.gearType || ''}
                  onChange={(e) => updateMeta({ gearType: e.target.value as NamGearType | '' })}
                >
                  <option value="">— Select —</option>
                  {NAM_GEAR_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-tone-type">Tone Type</label>
                <select
                  id="meta-tone-type"
                  className="form-select"
                  value={editedJob.metadata?.toneType || ''}
                  onChange={(e) => updateMeta({ toneType: e.target.value as NamToneType | '' })}
                >
                  <option value="">— Select —</option>
                  {NAM_TONE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-input-dbu">Send Level (dBu)</label>
                <input
                  id="meta-input-dbu"
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={editedJob.metadata?.inputLevelDbu ?? ''}
                  placeholder="e.g. +4"
                  onChange={(e) => updateMeta({ inputLevelDbu: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-output-dbu">Return Level (dBu)</label>
                <input
                  id="meta-output-dbu"
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={editedJob.metadata?.outputLevelDbu ?? ''}
                  placeholder="e.g. -10"
                  onChange={(e) => updateMeta({ outputLevelDbu: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>
            </div>

          </section>
          {/* ── Actions ── */}
          <div className="property-actions">
            <button
              type="submit"
              className={`btn ${canSave ? 'btn-green' : 'btn-secondary'}`}
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving...' : saveLabel}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleAttemptExit} disabled={isSaving}>
              Cancel
            </button>
            {showValidationErrors && !isValid && (
              <span style={{ color: 'var(--neon-magenta)', fontSize: '13px', fontWeight: 'bold' }}>
                Please fill in all required fields to save.
              </span>
            )}
          </div>
        </form>
      </div>
      <ConfirmDialog
        isOpen={isUnsavedConfirmOpen}
        title="Discard Unsaved Job Changes?"
        message="This job has unsaved edits. Save it now, keep editing, or discard your changes."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        alternateLabel={canSave ? saveLabel : undefined}
        alternateClassName="btn btn-green"
        onConfirm={() => {
          setIsUnsavedConfirmOpen(false)
          onCancel()
        }}
        onAlternate={() => void handleSaveAndExit()}
        onCancel={() => setIsUnsavedConfirmOpen(false)}
      />
    </PropertySheet>
  )
}
