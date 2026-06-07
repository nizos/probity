import type { RawSessionEvent, SessionEvent } from '../../types.js'

export function toCanonical(event: RawSessionEvent): SessionEvent {
  if (event.kind === 'prompt') return event
  switch (event.tool) {
    case 'run_command': {
      const { CommandLine } = event.input as { CommandLine: string }
      return { kind: 'command', command: CommandLine, output: event.output }
    }
    case 'write_to_file': {
      const { TargetFile, CodeContent } = event.input as {
        TargetFile: string
        CodeContent: string
      }
      return {
        kind: 'write',
        path: TargetFile,
        content: CodeContent,
        output: event.output,
      }
    }
    case 'replace_file_content': {
      // An edit; normalize to a write of the replacement fragment (ADR 0007).
      const { TargetFile, ReplacementContent } = event.input as {
        TargetFile: string
        ReplacementContent: string
      }
      return {
        kind: 'write',
        path: TargetFile,
        content: ReplacementContent,
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
