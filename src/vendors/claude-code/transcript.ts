import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

const ContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_use'),
    name: z.string(),
    id: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    content: z.string(),
    tool_use_id: z.string(),
    is_error: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
])

const FILE_WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const EntrySchema = z.object({
  type: z.string().optional(),
  message: z.object({ content: z.array(z.unknown()) }).optional(),
})

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const entries = await readJsonl(path, options)
  const pending = new Map<string, RawSessionEvent>()
  const emitted: RawSessionEvent[] = []
  const droppedToolUseIds = new Set<string>()

  for (const rawEntry of entries) {
    const entry = EntrySchema.safeParse(rawEntry)
    if (!entry.success) continue
    const content = entry.data.message?.content
    if (!content) continue
    for (const c of content) {
      const parsed = ContentItemSchema.safeParse(c)
      if (!parsed.success) continue
      const item = parsed.data
      if (item.type === 'tool_use') {
        const action: RawSessionEvent = {
          kind: 'action',
          tool: item.name,
          input: item.input,
          output: '',
          toolUseId: item.id,
        }
        pending.set(item.id, action)
        emitted.push(action)
      } else if (item.type === 'tool_result') {
        const existing = pending.get(item.tool_use_id)
        if (existing && existing.kind === 'action') {
          existing.output = item.content
          if (item.is_error === true && FILE_WRITE_TOOLS.has(existing.tool)) {
            droppedToolUseIds.add(item.tool_use_id)
          }
        }
      } else if (item.type === 'text' && entry.data.type === 'user') {
        emitted.push({ kind: 'prompt', text: item.text })
      }
    }
  }
  return emitted.filter(
    (event) =>
      event.kind !== 'action' || !droppedToolUseIds.has(event.toolUseId),
  )
}
