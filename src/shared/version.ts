interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('+')[0]
}

function parseVersionPart(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseAppVersion(version: string): ParsedVersion {
  const normalized = normalizeVersion(version)
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(normalized)
  if (!match) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: []
    }
  }

  return {
    major: parseVersionPart(match[1]),
    minor: parseVersionPart(match[2]),
    patch: parseVersionPart(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  }
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftIsNumber = /^\d+$/.test(left)
  const rightIsNumber = /^\d+$/.test(right)

  if (leftIsNumber && rightIsNumber) {
    return Number(left) - Number(right)
  }

  if (leftIsNumber && !rightIsNumber) {
    return -1
  }

  if (!leftIsNumber && rightIsNumber) {
    return 1
  }

  if (left > right) {
    return 1
  }

  if (left < right) {
    return -1
  }

  return 0
}

export function compareAppVersions(left: string, right: string): number {
  const leftVersion = parseAppVersion(left)
  const rightVersion = parseAppVersion(right)

  for (const key of ['major', 'minor', 'patch'] as const) {
    const diff = leftVersion[key] - rightVersion[key]
    if (diff !== 0) {
      return diff
    }
  }

  const leftIsStable = leftVersion.prerelease.length === 0
  const rightIsStable = rightVersion.prerelease.length === 0
  if (leftIsStable && rightIsStable) {
    return 0
  }
  if (leftIsStable) {
    return 1
  }
  if (rightIsStable) {
    return -1
  }

  const maxLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index]
    const rightIdentifier = rightVersion.prerelease[index]
    if (leftIdentifier == null) {
      return -1
    }
    if (rightIdentifier == null) {
      return 1
    }

    const diff = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}
