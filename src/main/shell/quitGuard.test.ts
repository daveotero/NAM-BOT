import { describe, expect, it, vi } from 'vitest'
import { createQuitGuard } from './quitGuard'

describe('quit confirmation', () => {
  it('keeps work running when either quit or close is canceled', async () => {
    const quit = vi.fn()
    const preventDefault = vi.fn()
    const guard = createQuitGuard({ hasActiveWork: () => true, confirmQuit: async () => false, quit, onError: vi.fn() })
    guard({ preventDefault })
    await vi.waitFor(() => expect(preventDefault).toHaveBeenCalledOnce())
    expect(quit).not.toHaveBeenCalled()
  })

  it('shares one pending confirmation across quit and window close and permits the approved quit', async () => {
    let approve: (value: boolean) => void = () => undefined
    const confirmQuit = vi.fn(() => new Promise<boolean>((resolve) => { approve = resolve }))
    const quit = vi.fn()
    const guard = createQuitGuard({ hasActiveWork: () => true, confirmQuit, quit, onError: vi.fn() })
    guard({ preventDefault: vi.fn() })
    guard({ preventDefault: vi.fn() })
    expect(confirmQuit).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()
    approve(true)
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce())
    const preventDefault = vi.fn()
    guard({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
