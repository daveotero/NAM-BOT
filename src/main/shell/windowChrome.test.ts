import { describe, expect, it } from 'vitest'
import { getWindowChromeOptions } from './windowChrome'

describe('native window chrome', () => {
  it('uses a 44 DIP native Windows control overlay without an auto-revealing menu', () => {
    expect(getWindowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#09090b', symbolColor: '#a1a1aa', height: 44 },
      autoHideMenuBar: false
    })
  })
  it('retains standard inset traffic lights and a native fallback elsewhere', () => {
    expect(getWindowChromeOptions('darwin')).toEqual({ titleBarStyle: 'hiddenInset' })
    expect(getWindowChromeOptions('linux')).toEqual({})
  })
})
