import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

const UserMessageSchema = z.object({
  type: z.literal('user.message'),
  data: z.object({ content: z.string() }),
})

const ToolStartSchema = z.object({
  type: z.literal('tool.execution_start'),
  data: z.object({
    toolCallId: z.string(),
    toolName: z.string(),
    arguments: z.unknown(),
  }),
})

const ToolCompleteSchema = z.object({
  type: z.literal('tool.execution_complete'),
  data: z.object({
    toolCallId: z.string(),
    success: z.boolean().optional(),
    result: z
      .object({
        content: z.string().optional(),
        detailedContent: z.string().optional(),
      })
      .optional(),
    error: z
      .object({
        message: z.string().optional(),
        code: z.string().optional(),
      })
      .optional(),
  }),
})

const FILE_WRITE_TOOLS = new Set(['create', 'edit'])

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const entries = await readJsonl(path, options)
  const pending = new Map<string, RawSessionEvent>()
  const emitted: RawSessionEvent[] = []
  const droppedToolUseIds = new Set<string>()
  for (const rawEntry of entries) {
    const user = UserMessageSchema.safeParse(rawEntry)
    if (user.success) {
      emitted.push({ kind: 'prompt', text: user.data.data.content })
      continue
    }
    const start = ToolStartSchema.safeParse(rawEntry)
    if (start.success) {
      const action: RawSessionEvent = {
        kind: 'action',
        tool: start.data.data.toolName,
        input: start.data.data.arguments,
        output: '',
        toolUseId: start.data.data.toolCallId,
      }
      pending.set(start.data.data.toolCallId, action)
      emitted.push(action)
      continue
    }
    const complete = ToolCompleteSchema.safeParse(rawEntry)
    if (complete.success) {
      const existing = pending.get(complete.data.data.toolCallId)
      if (existing && existing.kind === 'action') {
        existing.output =
          complete.data.data.result?.content ??
          complete.data.data.result?.detailedContent ??
          complete.data.data.error?.message ??
          ''
        if (
          complete.data.data.success === false &&
          FILE_WRITE_TOOLS.has(existing.tool)
        ) {
          droppedToolUseIds.add(complete.data.data.toolCallId)
        }
      }
    }
  }
  return emitted.filter(
    (event) =>
      event.kind !== 'action' || !droppedToolUseIds.has(event.toolUseId),
  )
}
