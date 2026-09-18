import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { EsrHistoryReader, normalizeEsrHistory } from './esr-history'

const directories: string[] = []

function createHistoryPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'nam-esr-history-'))
  directories.push(directory)
  return join(directory, 'esr-history.jsonl')
}

function record(epoch: number, esr: number, step = epoch * 10): object {
  return { epoch, step, models: [{ submodelIndex: 0, submodelName: 'channels_3', esr }] }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('ESR history ingestion', () => {
  it('waits for complete records and reads appended data exactly once', () => {
    const path = createHistoryPath()
    const reader = new EsrHistoryReader(path)
    expect(reader.read()).toEqual([])
    const first = JSON.stringify(record(1, 0.01))
    writeFileSync(path, first.slice(0, 20))
    expect(reader.read()).toEqual([])
    appendFileSync(path, `${first.slice(20)}\n`)
    expect(reader.read()).toEqual([record(1, 0.01)])
    expect(reader.read()).toEqual([])
    appendFileSync(path, `${JSON.stringify(record(2, 0.02))}\n`)
    expect(reader.read()).toEqual([record(2, 0.02)])
  })

  it('skips corrupt lines without dropping subsequent measurements', () => {
    const path = createHistoryPath()
    writeFileSync(path, `invalid\n${JSON.stringify(record(3, 0.000951))}\n`)
    expect(new EsrHistoryReader(path).read()).toEqual([record(3, 0.000951)])
  })

  it('keeps regressions and uses the last validation step within each epoch', () => {
    expect(normalizeEsrHistory([
      record(2, 0.01, 20), record(1, 0.001, 10), record(2, 0.02, 25), record(2, 0.005, 21)
    ])).toEqual([record(1, 0.001, 10), record(2, 0.02, 25)])
  })

  it('validates persisted history and preserves zero ESR and single-model metrics', () => {
    const single = { epoch: 1, step: 3, models: [{ submodelIndex: null, submodelName: null, esr: 0 }] }
    expect(normalizeEsrHistory([null, {}, record(0, 1), record(1, -1), record(1, Infinity), single])).toEqual([single])
    expect(normalizeEsrHistory(undefined)).toEqual([])
  })
})
