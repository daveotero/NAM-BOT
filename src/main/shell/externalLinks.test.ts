import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isTrustedExternalUrl } from './externalLinks'

const renderer = join(dirname(fileURLToPath(import.meta.url)), '../../renderer')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx$/.test(entry.name) ? [path] : []
  })
}

describe('external links', () => {
  it('opens only https links to trusted hosts', () => {
    expect(isTrustedExternalUrl('https://github.com/daveotero/nam-bot')).toBe(true)
    expect(isTrustedExternalUrl('http://github.com/daveotero/nam-bot')).toBe(false)
    expect(isTrustedExternalUrl('https://github.com.example.net/')).toBe(false)
    expect(isTrustedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isTrustedExternalUrl('not a url')).toBe(false)
  })

  it('allows every link the app renders, so none is silently blocked', () => {
    const blocked: string[] = []
    for (const path of sourceFiles(renderer)) {
      // Anchors use href=; the About terminal entries use link properties.
      for (const match of readFileSync(path, 'utf8').matchAll(/(?:href=|link:\s*)["'](https?:\/\/[^"']+)["']/g)) {
        if (!isTrustedExternalUrl(match[1])) blocked.push(`${relative(renderer, path)}: ${match[1]}`)
      }
    }
    expect(blocked).toEqual([])
  })
})
