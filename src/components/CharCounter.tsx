import { textLength } from '../lib/limits'

interface Props {
  id: string
  value: string
  max: number
}

export function CharCounter({ id, value, max }: Props) {
  const n = textLength(value)
  const full = n >= max
  return (
    <span
      id={id}
      className={`shrink-0 text-xs font-bold tabular-nums ${full ? 'text-danger' : 'text-muted'}`}
    >
      {n}/{max}
      <span className="sr-only"> karakter</span>
    </span>
  )
}
