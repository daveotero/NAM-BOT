# Issue 7: Job Defaults And Batch Creation

## Summary

This internal note captures the current context for GitHub issue `#7`, the existing implementation state in NAM-BOT, and the main product/technical constraints that should guide the eventual solution.

- Issue: `[Feature]: retain previous settings for new jobs`
- GitHub URL: <https://github.com/daveotero/nam-bot/issues/7>
- Status: discovery only, no implementation started yet
- Latest repo discussion state: waiting on more user detail about the Tone3000 workflow

## User Request

The original issue asks for faster repeated job creation:

- reuse metadata from the previous job
- auto-select the previously used input file
- reuse the previously chosen architecture or preset
- derive the job name and model name from the reamp file

There is also a follow-up comment asking for a stronger batch workflow:

- load multiple reamp files at once
- automatically create one job per file
- reuse shared metadata across those jobs
- keep model names file-specific

That follow-up references Tone3000 as the closest workflow example.

## Current NAM-BOT Behavior

The Jobs system already supports part of this workflow.

### What already exists

- `New Job` creates an editable draft before queueing.
- Dragging multiple output audio files onto the Jobs page creates one draft per file.
- Drag-and-drop draft creation already derives the draft name from the filename.
- New jobs already remember some preferences:
  - last-used preset
  - last-used output root mode
  - last-used exported-model filename suffix options
- New jobs also seed `Modeled By` from Settings `Default Author Name`.
- Drafts can be copied one at a time.
- `Queue All` can enqueue many valid drafts at once.

### What does not exist yet

- NAM metadata is not broadly inherited from the previous saved job.
- The previous custom input audio file is not reused as a general default for new jobs.
- Model name is not auto-derived from the reamp filename.
- There is no multi-select bulk edit flow for drafts.
- There is no folder or parent-child template system for jobs.
- Queued jobs cannot be safely mass-edited after enqueue.

## Current Technical Constraints

The current architecture matters here.

### Queue behavior

The queue manager is currently single-runner.

- It tracks a single `currentJob`.
- `startQueue()` pulls one queued job at a time.
- The existing queue system is about reducing setup friction, not true parallel training execution.

### Freeze-on-enqueue contract

Queue items intentionally freeze the job at enqueue time.

- Drafts are editable.
- Queue items are cloned from drafts.
- Later draft edits do not change an already queued run.

This is an important product contract and should not be weakened casually. A multi-edit flow aimed at queued jobs would cut across this design.

## Relevant Existing Implementation

These are the main places to revisit when implementation resumes.

- `src/renderer/features/jobs/Jobs.tsx`
  - new job creation
  - drag-and-drop draft creation
  - draft duplication
  - queue-all behavior
- `src/renderer/features/jobs/jobEditorSession.ts`
  - remembered preset/output-root/filename-suffix defaults
  - new draft seed logic
- `src/main/ipc/jobs.ts`
  - draft persistence
  - enqueue and duplicate handlers
- `src/main/jobs/queueManager.ts`
  - single-runner queue behavior
  - freeze-on-enqueue lifecycle
- `docs/jobs-system.md`
  - current Jobs feature behavior and terminology

## Main Solution Directions Discussed

### Option 1: Sticky last-job defaults

Reuse most values from the last saved job when creating a new draft.

Pros:

- smallest implementation
- matches the original issue closely
- fits the existing new-draft creation flow

Risks:

- easiest way to carry stale metadata forward by accident
- hidden defaults may surprise users when switching capture sessions

### Option 2: Bulk edit for drafts

Allow multiple draft jobs to be selected and edited together before queueing.

Pros:

- explicit and safer than silent carry-over
- strong fit for multi-mic or multi-variation capture sessions
- aligns with the existing draft-first workflow

Risks:

- larger UI and state-management rework
- should be limited to drafts, not queued items

### Option 3: Folder or template inheritance

Create a shared parent container that passes selected metadata down to child jobs.

Pros:

- most powerful long-term workflow
- best fit for organized capture-session management

Risks:

- biggest redesign of the three
- introduces a second grouping model on top of current drafts and queue concepts

## Working Recommendation

If issue `#7` is implemented in stages, the safest progression is:

1. improve new-draft defaults first
2. extend multi-file draft creation to reuse more shared fields
3. only then consider explicit draft bulk edit

Folder inheritance should be treated as a larger future feature unless user feedback clearly points there.

The strongest current product direction is:

- keep queue behavior unchanged
- keep edits focused on drafts
- make repeated job creation faster without weakening freeze-on-enqueue

## Suggested V1 Shape

If work starts before more feedback arrives, the most reasonable first version is:

- reuse the last saved draft or job as a template source for new drafts
- keep file-specific fields regenerated per dropped file
- apply shared fields automatically during multi-file draft creation

Fields that likely should carry over:

- preset
- input audio selection
- training overrides
- NAM metadata except file-derived naming fields
- exported-model filename suffix options

Fields that likely should still be regenerated per file:

- `job.name`
- `metadata.name`
- `outputAudioPath`
- usually `outputRootDir`

## Open Questions

These points are still unresolved.

- How exactly does Tone3000 handle shared metadata versus per-file naming?
- Should last-job reuse be automatic, explicit, or configurable?
- Should custom input audio always carry forward, or only when the user opts into a template-like flow?
- When deriving names from filenames, what filename patterns should NAM-BOT normalize or trim?
- Is draft bulk edit still necessary after better template/default behavior ships?

## Current Hold State

Work is intentionally paused for now.

- no code changes have been started
- no schema changes are planned yet
- no queue-model changes are planned yet
- user feedback from the GitHub thread should inform the next step
