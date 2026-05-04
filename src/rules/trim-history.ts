import type { RawSessionEvent } from '../types.js'

export type HistoryWindow = {
  maxEvents: number
  maxContentChars: number
}

export function trimHistory(
  events: RawSessionEvent[],
  window: HistoryWindow,
): RawSessionEvent[] {
  return events
    .slice(-window.maxEvents)
    .map((event) => truncate(event, window.maxContentChars))
}

function truncate(event: RawSessionEvent, max: number): RawSessionEvent {
  if (event.kind === 'prompt') {
    const text = clip(event.text, max)
    return text === event.text ? event : { ...event, text }
  }
  const output = clip(event.output, max)
  return output === event.output ? event : { ...event, output }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const half = Math.floor(max / 2)
  const head = s.slice(0, half)
  const tail = s.slice(s.length - half)
  const omitted = s.length - head.length - tail.length
  return `${head}\n[${omitted} more characters truncated]\n${tail}`
}
