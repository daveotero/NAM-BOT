/** Hosts the renderer may open in the user's browser. In-app links are checked against this list by test. */
export const TRUSTED_EXTERNAL_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'daveotero.com',
  'flatlineaudio.com',
  'ko-fi.com',
  'www.anaconda.com',
  'pytorch.org',
  'www.pytorch.org',
  'rocm.docs.amd.com',
  'developer.apple.com',
  'support.apple.com'
])

export function isTrustedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && TRUSTED_EXTERNAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}
