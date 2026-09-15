import type { RawSessionEvent, SessionEvent } from '../../types.js'

export function toCanonical(event: RawSessionEvent): SessionEvent {
  if (event.kind === 'prompt') return event
  switch (event.tool) {
    case 'Bash': {
      const { command } = event.input as { command: string }
      return { kind: 'command', command, output: event.output }
    }
    case 'Write': {
      const { filePath, content } = event.input as {
        filePath: string
        content: string
      }
      return { kind: 'write', path: filePath, content, output: event.output }
    }
    case 'Edit': {
      const { filePath, newString } = event.input as {
        filePath: string
        newString: string
      }
      return {
        kind: 'write',
        path: filePath,
        content: newString,
        output: event.output,
      }
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
