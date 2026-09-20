import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const renderer = dirname(dirname(fileURLToPath(import.meta.url)))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(css|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('application style contract', () => {
  it('keeps a readable shared type scale', () => {
    const tokens = readFileSync(join(renderer, 'styles/tokens.css'), 'utf8')
    const size = (name: string): number => Number(new RegExp(`--text-${name}:\\s*(\\d+)px`).exec(tokens)?.[1])
    expect(size('body')).toBeGreaterThanOrEqual(14)
    expect(size('secondary')).toBeGreaterThanOrEqual(12)
    expect(size('label')).toBeGreaterThan(size('body'))
    expect(size('heading')).toBeGreaterThan(size('label'))
    expect(size('title')).toBeGreaterThan(size('heading'))
  })

  it('requires shared tokens and classes instead of new local type sizes', () => {
    const violations: string[] = []
    for (const path of sourceFiles(renderer)) {
      const name = relative(renderer, path).replaceAll('\\', '/')
      // The game is an illustrated canvas/HUD, not an application reading surface.
      if (['styles/tokens.css', 'features/about/about-game.css', 'features/about/AboutMiniGame.tsx'].includes(name)) continue
      const source = readFileSync(path, 'utf8')
      if (path.endsWith('.css')) {
        for (const match of source.matchAll(/\b(?:font-size|font)\s*:\s*([^;{}]+)/g)) {
          if (/\d(?:px|rem|em|vw|vh|pt|%)/.test(match[1])) violations.push(`${name}: ${match[0]}`)
        }
      } else {
        const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        const visit = (node: ts.Node): void => {
          if (ts.isPropertyAssignment(node) && ['fontSize', 'fontFamily', 'font', 'lineHeight'].includes(node.name.getText(file))) {
            // The third-party editor requires inline typography; tokens keep both layers aligned.
            const adapter = name === 'components/JsonCodeEditor.tsx'
            if (!adapter || !node.initializer.getText(file).includes('var(--')) {
              violations.push(`${name}: ${node.getText(file)}`)
            }
          }
          if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'style') violations.push(`${name}: embedded stylesheet`)
          ts.forEachChild(node, visit)
        }
        visit(file)
      }
    }
    expect(violations).toEqual([])
  })
})
