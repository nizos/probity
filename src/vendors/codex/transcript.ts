import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { JsonString } from '../../utils/json-string.js'
import { readJsonl } from '../../utils/read-jsonl.js'
import { StringOrTextBlocks } from '../string-or-text-blocks.js'

const UserMessageSchema = z.object({
  type: z.literal('response_item'),
  payload: z.object({
    type: z.literal('message'),
    role: z.literal('user'),
    content: z.array(z.object({ text: z.string() })).min(1),
  }),
})

const FunctionCallSchema = z.object({
  type: z.literal('response_item'),
  payload: z.object({
    type: z.literal('function_call'),
    name: z.string(),
    arguments: JsonString,
    call_id: z.string(),
  }),
})

const FunctionCallOutputSchema = z.object({
  type: z.literal('response_item'),
  payload: z.object({
    type: z.literal('function_call_output'),
    call_id: z.string(),
    output: z.string(),
  }),
})

const CustomToolCallSchema = z.object({
  type: z.literal('response_item'),
  payload: z.object({
    type: z.literal('custom_tool_call'),
    name: z.string(),
    input: z.string(),
    call_id: z.string(),
  }),
})

const CustomToolCallOutputSchema = z.object({
  type: z.literal('response_item'),
  payload: z.object({
    type: z.literal('custom_tool_call_output'),
    call_id: z.string(),
    output: StringOrTextBlocks,
  }),
})

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const entries = await readJsonl(path, options)
  const pending = new Map<string, RawSessionEvent>()
  const emitted: RawSessionEvent[] = []
  for (const rawEntry of entries) {
    const user = UserMessageSchema.safeParse(rawEntry)
    if (user.success) {
      const text = user.data.payload.content[0]?.text ?? ''
      if (text.startsWith('<environment_context')) continue
      emitted.push({ kind: 'prompt', text })
      continue
    }
    const call = FunctionCallSchema.safeParse(rawEntry)
    if (call.success) {
      const action: RawSessionEvent = {
        kind: 'action',
        tool: call.data.payload.name,
        input: call.data.payload.arguments,
        output: '',
        toolUseId: call.data.payload.call_id,
      }
      pending.set(call.data.payload.call_id, action)
      emitted.push(action)
      continue
    }
    const done = FunctionCallOutputSchema.safeParse(rawEntry)
    if (done.success) {
      const existing = pending.get(done.data.payload.call_id)
      if (existing && existing.kind === 'action') {
        existing.output = done.data.payload.output
      }
      continue
    }
    const custom = CustomToolCallSchema.safeParse(rawEntry)
    if (custom.success) {
      const action: RawSessionEvent = {
        kind: 'action',
        tool: custom.data.payload.name,
        input: custom.data.payload.input,
        output: '',
        toolUseId: custom.data.payload.call_id,
      }
      pending.set(custom.data.payload.call_id, action)
      emitted.push(action)
      continue
    }
    const customDone = CustomToolCallOutputSchema.safeParse(rawEntry)
    if (customDone.success) {
      const existing = pending.get(customDone.data.payload.call_id)
      if (existing && existing.kind === 'action') {
        existing.output = customDone.data.payload.output
      }
    }
  }
  return emitted
}
