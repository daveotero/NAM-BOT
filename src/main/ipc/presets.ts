import { app, dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'
import log from 'electron-log/main'
import { deleteTrainingPreset, getPresetLoadWarnings, listTrainingPresets, saveTrainingPreset } from '../persistence/presetStore'
import { normalizeTrainingPreset, slugifyPresetName } from '../types/jobs'

const PRESET_EXPORT_SUFFIX = '.nam-bot-preset.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getImportedPresetName(filePath: string): string {
  const fileName = basename(filePath)
  const lowerFileName = fileName.toLowerCase()

  if (lowerFileName.endsWith(PRESET_EXPORT_SUFFIX)) {
    return fileName.slice(0, -PRESET_EXPORT_SUFFIX.length)
  }

  if (lowerFileName.endsWith('.json')) {
    return fileName.slice(0, -'.json'.length)
  }

  return fileName
}

function buildExportPreset(input: unknown): ReturnType<typeof normalizeTrainingPreset> {
  const preset = normalizeTrainingPreset(input)

  return normalizeTrainingPreset({
    ...preset,
    origin: {
      app: preset.origin?.app?.trim() || 'NAM-BOT',
      version: preset.origin?.version?.trim() || app.getVersion()
    }
  })
}

export function setupPresetIpcHandlers(): void {
  log.info('Setting up preset IPC handlers')

  ipcMain.handle('presets:list', async () => {
    return listTrainingPresets()
  })
  ipcMain.handle('presets:getWarnings', async () => getPresetLoadWarnings())

  ipcMain.handle('presets:save', async (_event, preset: unknown) => {
    return saveTrainingPreset(preset)
  })

  ipcMain.handle('presets:delete', async (_event, presetId: string) => {
    deleteTrainingPreset(presetId)
  })

  ipcMain.handle('presets:export', async (_event, input: unknown) => {
    const preset = buildExportPreset(input)
    const defaultPath = `${slugifyPresetName(preset.name)}${PRESET_EXPORT_SUFFIX}`
    const result = await dialog.showSaveDialog({
      title: 'Export Preset',
      defaultPath,
      filters: [{ name: 'NAM-BOT Preset JSON', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    writeFileSync(result.filePath, JSON.stringify(preset, null, 2), 'utf-8')
    log.info('Preset exported to:', result.filePath)
    return result.filePath
  })

  ipcMain.handle('presets:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Preset',
      properties: ['openFile'],
      filters: [{ name: 'NAM-BOT Preset JSON', extensions: ['json'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const importPath = result.filePaths[0]
    const raw = JSON.parse(readFileSync(importPath, 'utf-8')) as unknown
    if (!isRecord(raw) || (raw.presetKind !== 'training' && raw.schemaVersion !== 1)) {
      throw new Error('This file is not a NAM-BOT preset export. Use Import JSON inside the preset editor for raw config snippets.')
    }

    const imported = normalizeTrainingPreset(raw)
    const importedName = imported.name.trim() || getImportedPresetName(importPath)
    const now = new Date().toISOString()
    const saved = saveTrainingPreset({
      ...imported,
      id: `${slugifyPresetName(importedName)}-${Date.now()}`,
      name: importedName,
      builtIn: false,
      readOnly: false,
      visible: true,
      updatedAt: now,
      createdAt: imported.createdAt || now,
      description: imported.description || `Imported from ${basename(importPath)}`
    })

    log.info('Preset imported from:', importPath)
    return saved
  })

  log.info('Preset IPC handlers registered')
}
