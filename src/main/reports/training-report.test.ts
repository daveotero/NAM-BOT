import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultJobSpec } from '../../shared/training'
import { buildTrainingReportData } from '../../shared/training-report'
import { normalizeTrainingExportEvidence } from './report-evidence'

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))
import { createTrainingReportHtml, writeTrainingReport } from './training-report'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function report(): ReturnType<typeof buildTrainingReportData> {
  return buildTrainingReportData({
    jobId: 'test', jobName: '</script><script>window.pwned=true</script>', status: 'failed', pid: null,
    frozenJob: { ...defaultJobSpec, id: 'test', name: 'test', createdAt: '', updatedAt: '' }, userMessages: []
  }, { appVersion: 'test', modelPath: null })
}

describe('standalone report files', () => {
  it('escapes data, embeds fonts and script, and restricts document capabilities', () => {
    const html = createTrainingReportHtml(report(), 'html')
    expect(html).not.toContain('<script>window.pwned=true</script>')
    expect(html).toContain('\\u003c/script\\u003e')
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("script-src 'sha256-")
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=/)
    expect(html).toContain('SIL OPEN FONT LICENSE')
  })

  it('preserves unrelated companion files and supports an explicitly chosen overwrite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nam-report-'))
    directories.push(directory)
    const destination = join(directory, 'Model.training.html')
    writeFileSync(destination, 'Existing report')
    const path = await writeTrainingReport(report(), 'html', destination)
    expect(path).toBe(join(directory, 'Model.training (2).html'))
    expect(readFileSync(destination, 'utf8')).toBe('Existing report')
    expect(readFileSync(path, 'utf8')).toContain('NAM-BOT Training Report')
    await writeTrainingReport(report(), 'html', destination, true)
    expect(readFileSync(destination, 'utf8')).toContain('NAM-BOT Training Report')
    expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it('normalizes export evidence without leaking checkpoint paths or invalid measurements', () => {
    expect(normalizeTrainingExportEvidence({ capturedAt: 'bad' })).toBeUndefined()
    const evidence = normalizeTrainingExportEvidence({ capturedAt: '2026-09-19T10:00:00Z', history: [], metrics: [
      { submodelIndex: 0, esr: 0, epoch: 1, checkpointPath: '/private/checkpoint' },
      { submodelIndex: 1, esr: -1, epoch: 0 }
    ] })
    expect(evidence?.metrics).toEqual([
      { submodelIndex: 0, submodelName: null, esr: 0, epoch: 1 },
      { submodelIndex: 1, submodelName: null, esr: null, epoch: null }
    ])
  })
})
