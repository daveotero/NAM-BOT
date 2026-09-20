import { EventEmitter } from 'node:events'
import { Notification } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultJobSpec } from '../../shared/training'
import type { JobRuntimeState } from '../types/jobs'

const mocks = vi.hoisted(() => ({ show: vi.fn(), options: vi.fn(), supported: vi.fn(() => true), instances: [] as EventEmitter[] }))
vi.mock('electron', () => ({
  Notification: class extends EventEmitter {
    static isSupported = mocks.supported
    constructor(options: unknown) { super(); mocks.options(options); mocks.instances.push(this) }
    show = mocks.show
  }
}))
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn() } }))
import { createJobNotifier } from './jobNotifications'

function runtime(status: JobRuntimeState['status'], jobId: string = 'job'): JobRuntimeState {
  return { jobId, jobName: 'Studio capture', status, pid: null, frozenJob: { ...defaultJobSpec, id: jobId, createdAt: '', updatedAt: '' }, userMessages: [] }
}

beforeEach(() => { vi.clearAllMocks(); mocks.instances.length = 0; mocks.supported.mockReturnValue(true) })

describe('job notifications', () => {
  it.each(['succeeded', 'failed', 'canceled', 'queued'] as const)('honors the master switch for %s and never replays suppressed alerts', (status) => {
    let enabled = false
    const notify = createJobNotifier({ isEnabled: () => enabled, navigate: vi.fn() })
    const job = { ...runtime(status), errorCategory: 'a2_diagnostics_pending' as const }
    notify(job)
    expect(mocks.show).not.toHaveBeenCalled()
    enabled = true
    notify(job)
    expect(mocks.show).not.toHaveBeenCalled()
    notify({ ...job, jobId: 'next' })
    expect(mocks.show).toHaveBeenCalledOnce()
    enabled = false
    notify({ ...job, jobId: 'disabled-again' })
    expect(mocks.show).toHaveBeenCalledOnce()
  })

  it('deduplicates updates but allows completion after a rerun', () => {
    const notify = createJobNotifier({ isEnabled: () => true, navigate: vi.fn() })
    notify(runtime('succeeded')); notify(runtime('succeeded'))
    expect(mocks.show).toHaveBeenCalledOnce()
    notify(runtime('queued')); notify(runtime('running')); notify(runtime('succeeded'))
    expect(mocks.show).toHaveBeenCalledTimes(2)
  })

  it('opens the matching screen on click', () => {
    const navigate = vi.fn()
    const notify = createJobNotifier({ isEnabled: () => true, navigate })
    notify(runtime('succeeded'))
    mocks.instances[0].emit('click')
    expect(navigate).toHaveBeenLastCalledWith('/jobs')
    notify({ ...runtime('queued'), errorCategory: 'a2_diagnostics_pending' })
    mocks.instances[1].emit('click')
    expect(navigate).toHaveBeenLastCalledWith('/diagnostics')
  })

  it('does not interrupt job updates when notifications are unsupported or fail', () => {
    const notify = createJobNotifier({ isEnabled: () => true, navigate: vi.fn() })
    vi.mocked(Notification.isSupported).mockReturnValue(false)
    notify(runtime('failed'))
    expect(mocks.show).not.toHaveBeenCalled()
    mocks.supported.mockReturnValue(true)
    mocks.show.mockImplementationOnce(() => { throw new Error('Notification unavailable') })
    expect(() => notify(runtime('failed', 'next'))).not.toThrow()
  })
})
