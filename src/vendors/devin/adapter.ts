import { z } from 'zod'
import type { Action, Decision } from '../../types.js'
import type { ParseActionResult } from '../adapter.js'
import { parseAction as parseClaudeAction } from '../claude-code/adapter.js'
import { posixAbsolute } from '../posix-absolute.js'

const envelope = z.object({
  hook_event_name: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  cwd: z.string().optional(),
})
const patchInput = z.union([
  z.object({ patch: z.string() }).transform((d) => d.patch),
  z.object({ command: z.string() }).transform((d) => d.command),
  z.object({ input: z.string() }).transform((d) => d.input),
])
const tools: Record<string, string> = {
  exec: 'Bash',
  write: 'Write',
  edit: 'Edit',
  notebook_edit: 'NotebookEdit',
}

export async function parseAction(
  payload: unknown,
): Promise<ParseActionResult> {
  const parsed = envelope.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: parsed.error.message }
  const d = parsed.data
  // Recording hooks do not authorize or evaluate an already completed action.
  if (d.hook_event_name && d.hook_event_name !== 'PreToolUse') {
    return { ok: true, actions: [] }
  }
  if (!d.tool_name) return { ok: false, reason: 'Devin: missing tool_name' }
  const cwd = d.cwd ?? process.env.DEVIN_PROJECT_DIR ?? process.cwd()
  if (d.tool_name === 'apply_patch') {
    const patch = patchInput.safeParse(d.tool_input)
    if (!patch.success) return { ok: false, reason: patch.error.message }
    const headers = [
      ...patch.data.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm),
    ]
    if (!headers.length)
      return { ok: false, reason: 'Devin apply_patch: missing file headers' }
    const actions: Action[] = []
    for (const [i, header] of headers.entries()) {
      const content = patch.data.slice(
        header.index,
        headers[i + 1]?.index ?? patch.data.length,
      )
      actions.push({
        kind: 'write',
        path: posixAbsolute(cwd, header[1]!.trim()),
        content,
      })
      const move = /^\*\*\* Move to: (.+)$/m.exec(content)
      if (move)
        actions.push({
          kind: 'write',
          path: posixAbsolute(cwd, move[1]!.trim()),
          content,
        })
    }
    return { ok: true, actions }
  }
  return parseClaudeAction({
    ...d,
    cwd,
    tool_name: tools[d.tool_name] ?? d.tool_name,
  })
}

export function sessionPath(payload: unknown): string | undefined {
  const result = z.object({ transcript_path: z.string() }).safeParse(payload)
  return result.success ? result.data.transcript_path : undefined
}

export function toResponse(decision: Decision): string {
  return decision.kind === 'block'
    ? JSON.stringify({ decision: 'block', reason: decision.reason })
    : ''
}
