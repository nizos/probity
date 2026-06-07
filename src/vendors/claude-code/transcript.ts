import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

/**
 * A tool_result's `content` is a string in many entries but an array of
 * content blocks in others (Claude Code persists the raw Anthropic
 * message shape: text blocks, images, tool references). Normalize to a
 * string by joining the text blocks; non-text blocks (images, tool
 * references) carry nothing a text validator can read and are dropped.
 * Without this the whole entry fails the schema and the tool's output is
 * silently lost — a fail-open where the AI validator never sees a test
 * run that happened to be reported as text blocks.
 */
const ToolResultContent = z.union([
  z.string(),
  z.array(z.unknown()).transform((blocks) =>
    blocks
      .map((block) => z.object({ text: z.string() }).safeParse(block))
      .flatMap((parsed) => (parsed.success ? [parsed.data.text] : []))
      .join('\n'),
  ),
])

const ContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_use'),
    name: z.string(),
    id: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    content: ToolResultContent,
    tool_use_id: z.string(),
  }),
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
])

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
        }
      } else if (item.type === 'text' && entry.data.type === 'user') {
        emitted.push({ kind: 'prompt', text: item.text })
      }
    }
  }
  return emitted
}
