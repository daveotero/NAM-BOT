import { useState, type InputHTMLAttributes, type JSX } from 'react'

// While focused, these inputs show exactly what was typed, even when the stored value
// differs: the text is still incomplete, such as an empty field or a lone minus sign, or
// an autosave has normalized it. After blur they show the stored value again.

type InputAttributes = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>

interface DraftTextInputProps extends InputAttributes {
  value: string
  onValueChange: (text: string) => void
}

interface DraftNumberInputProps<TValue extends number | null> extends InputAttributes {
  value: number | null
  /** The value to store for the typed text, or undefined while it is incomplete or invalid. */
  parse: (text: string) => TValue | undefined
  onValueChange: (value: TValue) => void
}

export function DraftTextInput({ value, onValueChange, onBlur, ...attributes }: DraftTextInputProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  return <input {...attributes} type="text" value={draft ?? value}
    onChange={(event) => {
      setDraft(event.target.value)
      onValueChange(event.target.value)
    }}
    onBlur={(event) => {
      setDraft(null)
      onBlur?.(event)
    }} />
}

export function DraftNumberInput<TValue extends number | null>({ value, parse, onValueChange, onBlur, ...attributes }: DraftNumberInputProps<TValue>): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  return <input {...attributes} type="number" value={draft ?? value ?? ''}
    onChange={(event) => {
      setDraft(event.target.value)
      const parsed = parse(event.target.value)
      if (parsed !== undefined) onValueChange(parsed)
    }}
    onBlur={(event) => {
      setDraft(null)
      onBlur?.(event)
    }} />
}
