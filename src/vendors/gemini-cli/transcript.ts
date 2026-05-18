import { z } from 'zod'
import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

const UserMessageSchema = z.object({
  type: z.literal('user'),
  content: z.array(z.object({ text: z.string() })),
})

const GeminiMessageSchema = z.object({
  type: z.literal('gemini'),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        args: z.unknown(),
        result: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
})

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const entries = await readJsonl(path, options)
  const emitted: RawSessionEvent[] = []

  for (const entry of entries) {
    const user = UserMessageSchema.safeParse(entry)
    if (user.success) {
      const text = user.data.content.map((c) => c.text).join('\n')
      emitted.push({ kind: 'prompt', text })
      continue
    }

    const gemini = GeminiMessageSchema.safeParse(entry)
    if (gemini.success && gemini.data.toolCalls) {
      for (const call of gemini.data.toolCalls) {
        const output = extractToolOutput(call.result)
        emitted.push({
          kind: 'action',
          tool: call.name,
          input: call.args,
          output,
          toolUseId: call.id,
        })
      }
    }
  }

  return emitted
}

function extractToolOutput(result: unknown[] | undefined): string {
  if (!result || !Array.isArray(result) || result.length === 0) return ''
  const first = result[0]
  if (!isPlainObject(first)) return ''

  const functionResponse = first['functionResponse']
  if (!isPlainObject(functionResponse)) return ''

  const response = functionResponse['response']
  if (!isPlainObject(response)) return ''

  const output = response['output']
  return typeof output === 'string' ? output : ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
