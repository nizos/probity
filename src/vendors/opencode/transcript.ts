import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

const ToolStateSchema = z.object({
  status: z.string(),
  input: z.unknown(),
  output: z.string().optional(),
  error: z.string().optional(),
})

const ToolPartSchema = z.object({
  type: z.literal('tool'),
  tool: z.string(),
  callID: z.string(),
  state: ToolStateSchema,
})

const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const MessageSchema = z.object({
  info: z.object({
    role: z.enum(['user', 'assistant']),
    id: z.string(),
  }),
  parts: z.array(z.unknown()),
})

/**
 * Reads an OpenCode-native JSONL transcript and produces
 * `RawSessionEvent[]`. Each line is an OpenCode message with `info`
 * (role, id) and `parts` (text, tool, or other). User text parts
 * become prompts, tool parts become actions, everything else is
 * skipped.
 */
export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  let entries: unknown[]
  try {
    entries = await readJsonl(path, options)
  } catch {
    return []
  }

  const emitted: RawSessionEvent[] = []

  for (const rawEntry of entries) {
    const parsed = MessageSchema.safeParse(rawEntry)
    if (!parsed.success) continue

    const { info, parts } = parsed.data

    for (const part of parts) {
      const textResult = TextPartSchema.safeParse(part)
      if (textResult.success) {
        // Only user text becomes a prompt; assistant text is skipped
        if (info.role === 'user') {
          emitted.push({ kind: 'prompt', text: textResult.data.text })
        }
        continue
      }

      const toolResult = ToolPartSchema.safeParse(part)
      if (toolResult.success) {
        const { tool, callID, state } = toolResult.data
        const output = toolOutput(state)
        emitted.push({
          kind: 'action',
          tool,
          input: state.input,
          output,
          toolUseId: callID,
        })
      }
      // Unknown part types (reasoning, step-start, etc.) are skipped
    }
  }

  return emitted
}

function toolOutput(state: z.infer<typeof ToolStateSchema>): string {
  if (state.status === 'completed' && state.output !== undefined) {
    return state.output
  }
  if (state.status === 'error' && state.error !== undefined) {
    return `Error: ${state.error}`
  }
  return ''
}
