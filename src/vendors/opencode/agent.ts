import type { Agent, AgentTelemetry } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

/**
 * A function that sends a prompt and returns the validator's text
 * response. Provided via DI so tests can inject a mock; the default
 * lazy-loads the OpenCode SDK and drives `session.prompt()`.
 */
export type PromptFn = (
  prompt: string,
) => Promise<{ text: string; meta?: AgentTelemetry }>

export function opencode(deps: { promptFn?: PromptFn } = {}): Agent {
  return {
    reason: (prompt) =>
      toVerdict(async () => {
        const promptFn = deps.promptFn ?? (await loadDefaultPromptFn())
        return promptFn(prompt)
      }),
  }
}

async function loadDefaultPromptFn(): Promise<PromptFn> {
  const { createOpencodeClient } = await import('@opencode-ai/sdk')
  const client = createOpencodeClient()

  return async (prompt) => {
    const createResult = await client.session.create({
      body: { title: 'probity-validation' },
    })
    const session = createResult.data
    if (!session) throw new Error('failed to create validation session')
    try {
      const promptResult = await client.session.prompt({
        path: { id: session.id },
        body: {
          system:
            'You are a code validation agent. Respond with JSON only: ' +
            '{"kind":"pass","reason":"..."} or {"kind":"violation","reason":"..."}',
          tools: {},
          parts: [{ type: 'text' as const, text: prompt }],
        },
      })
      const response = promptResult.data
      if (!response) throw new Error('no response from validation session')
      const text = (response.parts as { type: string; text?: string }[])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
      const meta = extractMeta(response.info)
      return meta ? { text, meta } : { text }
    } finally {
      await client.session
        .delete({ path: { id: session.id } })
        .catch(() => undefined)
    }
  }
}

function extractMeta(
  info: Record<string, unknown>,
): AgentTelemetry | undefined {
  const meta: Record<string, unknown> = {}
  if (typeof info.modelID === 'string') meta.model = info.modelID
  if (typeof info.providerID === 'string') meta.provider = info.providerID
  if (isTokens(info.tokens)) {
    if (info.tokens.input > 0) meta.inputTokens = info.tokens.input
    if (info.tokens.output > 0) meta.outputTokens = info.tokens.output
  }
  return Object.keys(meta).length > 0 ? (meta as AgentTelemetry) : undefined
}

function isTokens(v: unknown): v is { input: number; output: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'input' in v &&
    'output' in v &&
    typeof (v as Record<string, unknown>).input === 'number' &&
    typeof (v as Record<string, unknown>).output === 'number'
  )
}
