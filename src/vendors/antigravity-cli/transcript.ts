import { z } from 'zod'
import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

// A tool call lives in a PLANNER_RESPONSE step's tool_calls; its result is
// the next step (CODE_ACTION, RUN_COMMAND, VIEW_FILE, ..., or a SYSTEM
// ERROR_MESSAGE on failure). Nothing links the two, so we pair positionally.
const StepSchema = z.object({
  step_index: z.number(),
  type: z.string(),
  content: z.string().optional(),
  tool_calls: z
    .array(z.object({ name: z.string(), args: z.unknown() }))
    .optional(),
})

type PendingCall = { tool: string; input: unknown; toolUseId: string }

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const entries = await readJsonl(path, options)
  const emitted: RawSessionEvent[] = []
  const pending: PendingCall[] = []

  const resolve = (output: string) => {
    const call = pending.shift()
    if (call) emitted.push({ kind: 'action', ...call, output })
  }

  for (const entry of entries) {
    const step = StepSchema.safeParse(entry)
    if (!step.success) continue
    const { type, step_index, content, tool_calls } = step.data

    if (type === 'USER_INPUT') {
      emitted.push({ kind: 'prompt', text: extractRequest(content ?? '') })
    } else if (type === 'PLANNER_RESPONSE') {
      tool_calls?.forEach((call, i) =>
        pending.push({
          tool: call.name,
          input: call.args,
          toolUseId: `${step_index}-${i}`,
        }),
      )
    } else {
      // Catch-all: any other step resolves the oldest pending call. Assumes no
      // non-result step arrives mid-call: the captured CONVERSATION_HISTORY sits
      // at turn-open with nothing pending. If one does, all later pairings shift.
      resolve(content ?? '')
    }
  }

  // A trailing call whose result step is absent (e.g. the transcript ends
  // right after it) still surfaces, with empty output.
  while (pending.length) resolve('')

  return emitted
}

// The prompt is wrapped in a <USER_REQUEST> tag alongside injected metadata.
function extractRequest(content: string): string {
  const match = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/.exec(content)
  return (match ? match[1]! : content).trim()
}
