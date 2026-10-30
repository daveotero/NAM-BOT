import { rehype } from 'rehype'
import { describe, expect, it } from 'vitest'

import { rehypePrismJson } from './json-highlighting'

// Mirrors how the code editor renders its highlight layer. The plugin ignores missing
// grammars, so a lost JSON registration would otherwise only show as plain text.
function highlight(code: string, language: string = 'json'): string {
  return rehype().data('settings', { fragment: true })
    .use([[rehypePrismJson, { ignoreMissing: true, showLineNumbers: true }]])
    .processSync(`<pre aria-hidden=true><code class="language-${language}">${code}</code><br /></pre>`)
    .toString()
}

describe('JSON editor highlighting', () => {
  it('highlights JSON tokens and numbers each line for error markers', () => {
    const html = highlight('{\n  "epochs": 100,\n  "fit": true\n}')
    expect(html).toContain('<span class="token property">"epochs"</span>')
    expect(html).toContain('<span class="token number">100</span>')
    expect(html).toContain('<span class="token boolean">true</span>')
    expect(html).toMatch(/class="code-line line-number" line="3"/)
  })

  it('leaves other languages as plain text instead of bundling their grammars', () => {
    expect(highlight('const value = 1', 'javascript')).not.toContain('class="token')
  })
})
