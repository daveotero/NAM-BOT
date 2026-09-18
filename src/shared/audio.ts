// NAM 0.13 uses wavio, with a librosa fallback for other supported audio formats.
export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'aiff', 'aif']
export const AUDIO_FILE_ACCEPT = AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(',')

export function isSupportedAudioFile(fileName: string): boolean {
  return AUDIO_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(`.${extension}`))
}
