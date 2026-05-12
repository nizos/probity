import type { RawSessionEvent, SessionEvent } from '../../types.js'

export function toCanonical(event: RawSessionEvent): SessionEvent {
  if (event.kind === 'prompt') return event
  switch (event.tool) {
    case 'bash': {
      const { command } = event.input as { command: string }
      return { kind: 'command', command, output: event.output }
    }
    case 'create': {
      const { path, file_text } = event.input as {
        path: string
        file_text: string
      }
      return { kind: 'write', path, content: file_text, output: event.output }
    }
    case 'edit': {
      const { path, new_str } = event.input as { path: string; new_str: string }
      return { kind: 'write', path, content: new_str, output: event.output }
    }
    default:
      return {
        kind: 'other',
        tool: event.tool,
        input: event.input,
        output: event.output,
      }
  }
}
