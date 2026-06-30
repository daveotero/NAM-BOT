import { describe, expect, it } from 'vitest'

import { compareAppVersions } from './version'

describe('compareAppVersions', () => {
  it('treats a stable release as newer than its release candidates', () => {
    expect(compareAppVersions('0.6.0', '0.6.0-rc.2')).toBeGreaterThan(0)
    expect(compareAppVersions('0.6.0-rc.2', '0.6.0')).toBeLessThan(0)
  })

  it('does not treat the current stable release as older than a matching release candidate', () => {
    expect(compareAppVersions('v0.6.0-rc.2', '0.6.0')).toBeLessThan(0)
  })

  it('orders prerelease revisions numerically', () => {
    expect(compareAppVersions('0.6.0-rc.10', '0.6.0-rc.2')).toBeGreaterThan(0)
  })

  it('ignores build metadata', () => {
    expect(compareAppVersions('0.6.0+build.2', '0.6.0')).toBe(0)
  })

  it('keeps normal patch releases ordered after stable releases', () => {
    expect(compareAppVersions('0.6.1', '0.6.0')).toBeGreaterThan(0)
    expect(compareAppVersions('0.5.1', '0.6.0')).toBeLessThan(0)
  })
})
