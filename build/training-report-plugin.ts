import { readFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function trainingReportPlugin(): Plugin {
  const id = 'virtual:training-report-assets'
  return {
    name: 'training-report-assets',
    resolveId(source: string): string | undefined { return source === id ? `\0${id}` : undefined },
    load(source: string): string | undefined {
      if (source !== `\0${id}`) return undefined
      const result = buildSync({
        entryPoints: [resolve('src/renderer/report/report-entry.tsx')],
        outfile: 'training-report.js', write: false, bundle: true, minify: true, metafile: true,
        format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022',
        define: { 'process.env.NODE_ENV': '"production"' },
        loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' }, legalComments: 'inline'
      })
      for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(input))
      const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
      const style = result.outputFiles.find(file => file.path.endsWith('.css'))?.text
      if (!script || !style) throw new Error('Training report bundle is incomplete.')
      const notices = ['inter', 'vt323'].map(font => readFileSync(resolve(`node_modules/@fontsource/${font}/LICENSE`), 'utf8')).join('\n')
      const cursorNoticePath = resolve('src/renderer/assets/horns-cursor.LICENSE.txt')
      this.addWatchFile(cursorNoticePath)
      const cursorNotice = readFileSync(cursorNoticePath, 'utf8')
      return `export const script = ${JSON.stringify(script)}; export const style = ${JSON.stringify(`${style}\n/* Bundled font licenses\n${notices}\nCursor artwork\n${cursorNotice}\n*/`)};`
    }
  }
}
