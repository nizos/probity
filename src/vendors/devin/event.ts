import type { RawSessionEvent, SessionEvent } from '../../types.js'
import { toCanonical as claudeCanonical } from '../claude-code/event.js'

export function toCanonical(event: RawSessionEvent): SessionEvent {
  if (event.kind === 'prompt') return event
  const names: Record<string, string> = {
    exec: 'Bash',
    write: 'Write',
    edit: 'Edit',
  }
  return claudeCanonical({ ...event, tool: names[event.tool] ?? event.tool })
}
