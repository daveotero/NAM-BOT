import { describe, expect, it } from 'vitest'

import { readNumber, readWholeNumber } from './number-input'

describe('number input parsing', () => {
  it('waits on empty or incomplete text instead of reading it as zero', () => {
    expect(readNumber('')).toBeUndefined()
    expect(readNumber('  ')).toBeUndefined()
    expect(readNumber('-')).toBeUndefined()
    expect(readNumber('0')).toBe(0)
    expect(readNumber('-0.25')).toBe(-0.25)
    expect(readNumber('1e-7')).toBe(1e-7)
  })

  it('accepts only whole numbers within the minimum', () => {
    expect(readWholeNumber('-12')).toBe(-12)
    expect(readWholeNumber('1.5', 1)).toBeUndefined()
    expect(readWholeNumber('0', 1)).toBeUndefined()
    expect(readWholeNumber('250', 1)).toBe(250)
    expect(readWholeNumber('1e20', 1)).toBeUndefined()
  })
})
