import type { Options as ClaudeQueryOptions } from '@anthropic-ai/claude-agent-sdk'

import type { Agent } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

type ClaudeMessage = { type: string; [k: string]: unknown }

export type QueryFn = (args: {
  prompt: string
  options?: ClaudeQueryOptions
}) => AsyncIterable<ClaudeMessage>

export function claudeCode(deps: { queryFn?: QueryFn } = {}): Agent {
  return {
    reason: (prompt) =>
      toVerdict(async () => {
        const queryFn = deps.queryFn ?? (await loadDefaultQueryFn())
        return getResult(queryFn, prompt)
      }),
  }
}

async function loadDefaultQueryFn(): Promise<QueryFn> {
  const mod = await import('@anthropic-ai/claude-agent-sdk')
  return mod.query
}

async function getResult(
  queryFn: QueryFn,
  prompt: string,
): Promise<{ text: string; meta?: ClaudeCodeMeta }> {
  for await (const message of queryFn({
    prompt,
    options: {
      maxTurns: 1,
      thinking: { type: 'disabled' },
      permissionMode: 'dontAsk',
      tools: [],
      settings: { autoMemoryEnabled: false },
      settingSources: [],
      persistSession: false,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      if (typeof message.result !== 'string') {
        throw new Error(
          `expected string result from validator, got ${typeof message.result}`,
        )
      }
      const meta = extractMeta(message)
      return meta ? { text: message.result, meta } : { text: message.result }
    }
  }
  throw new Error(
    'no result message received: SDK query stream ended without a ' +
      '{type:"result", subtype:"success"} message (typically an SDK/transport failure)',
  )
}

type ClaudeCodeMeta = {
  model?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

function extractMeta(message: ClaudeMessage): ClaudeCodeMeta | undefined {
  const meta: ClaudeCodeMeta = {}
  if (isObject(message.usage)) {
    const usage = message.usage
    if (typeof usage.input_tokens === 'number') {
      meta.inputTokens = usage.input_tokens
    }
    if (typeof usage.output_tokens === 'number') {
      meta.outputTokens = usage.output_tokens
    }
    if (typeof usage.cache_read_input_tokens === 'number') {
      meta.cacheReadInputTokens = usage.cache_read_input_tokens
    }
    if (typeof usage.cache_creation_input_tokens === 'number') {
      meta.cacheCreationInputTokens = usage.cache_creation_input_tokens
    }
  }
  if (isObject(message.modelUsage)) {
    // modelUsage is keyed by model name; a single-turn validation run
    // has exactly one, so its first key is the model.
    const [model] = Object.keys(message.modelUsage)
    if (model) meta.model = model
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
