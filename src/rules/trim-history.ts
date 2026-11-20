import type { RawSessionEvent } from '../types.js'

/**
 * Bounds on the recent-history window an AI rule includes in its prompt.
 * `maxEvents` caps the count (keeps the tail); `maxContentChars` caps
 * each event's text, formatted input, and output length (head + tail clip with an omission
 * marker in the middle).
 */
export type HistoryWindow = {
  maxEvents: number
  maxContentChars: number
}

/**
 * Returns the last `maxEvents` events, each clipped to `maxContentChars`.
 * Events whose content is already within the cap pass through by
 * reference; only oversized events are rewritten.
 */
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
  const formattedInput = formatHistoryInput(event.input)
  const input = clip(formattedInput, max)
  const output = clip(event.output, max)
  if (input === formattedInput && output === event.output) return event
  return {
    ...event,
    ...(input !== formattedInput && { input }),
    ...(output !== event.output && { output }),
  }
}

export function formatHistoryInput(input: unknown): string {
  if (typeof input === 'string') return input
  return JSON.stringify(input) ?? String(input)
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const half = Math.floor(max / 2)
  const head = s.slice(0, half)
  const tail = s.slice(s.length - half)
  const omitted = s.length - head.length - tail.length
  return `${head}\n[${omitted} more characters truncated]\n${tail}`
}
