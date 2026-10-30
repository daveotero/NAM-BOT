/** The finite number in typed text, or undefined while the text is empty or incomplete. */
export function readNumber(text: string): number | undefined {
  if (text.trim() === '') {
    return undefined
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** A whole number of at least minimum, or undefined for any other text. */
export function readWholeNumber(text: string, minimum: number = Number.MIN_SAFE_INTEGER): number | undefined {
  const value = readNumber(text)
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum ? value : undefined
}
