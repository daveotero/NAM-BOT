interface BackendTarget {
  condaExecutablePath: string | null
  backendMode: string
  environmentName: string | null
  environmentPrefixPath: string | null
}

export function buildBackendSettingsKey(settings: BackendTarget): string {
  return JSON.stringify({
    condaExecutablePath: settings.condaExecutablePath,
    backendMode: settings.backendMode,
    environmentName: settings.environmentName,
    environmentPrefixPath: settings.environmentPrefixPath
  })
}
