import type { Options as ClaudeQueryOptions } from '@anthropic-ai/claude-agent-sdk'

import type { Agent } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

type ClaudeMessage = { type: string; [k: string]: unknown }

// Keep the SDK runtime lazy-loaded. This mirrors its public marker value
// without adding an eager import to every hook invocation.
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY: typeof import('@anthropic-ai/claude-agent-sdk').SYSTEM_PROMPT_DYNAMIC_BOUNDARY =
  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

export type QueryFn = (args: {
  prompt: string
  options?: ClaudeQueryOptions
}) => AsyncIterable<ClaudeMessage>

export function claudeCode(deps: { queryFn?: QueryFn } = {}): Agent {
  const reason = (
    prompt: string,
    systemPrompt?: ClaudeQueryOptions['systemPrompt'],
  ) =>
    toVerdict(async () => {
      const queryFn = deps.queryFn ?? (await loadDefaultQueryFn())
      return getResult(queryFn, prompt, systemPrompt)
    })
  return {
    reason,
    reasonWithSystem: ({ system, prompt }) =>
      reason(prompt, [system, SYSTEM_PROMPT_DYNAMIC_BOUNDARY]),
  }
}

async function loadDefaultQueryFn(): Promise<QueryFn> {
  const mod = await import('@anthropic-ai/claude-agent-sdk')
  return mod.query
}

async function getResult(
  queryFn: QueryFn,
  prompt: string,
  systemPrompt?: ClaudeQueryOptions['systemPrompt'],
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
      ...(systemPrompt && { systemPrompt }),
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
  models: readonly ModelUsageRow[]
}

type ModelUsageRow = {
  model: string
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

/**
 * modelUsage includes auxiliary harness calls (routing, classification)
 * alongside the verdict author, and nothing in it marks which is which,
 * so no single model is attributed.
 */
function extractMeta(message: ClaudeMessage): ClaudeCodeMeta | undefined {
  if (!isObject(message.modelUsage)) return undefined
  const models = Object.entries(message.modelUsage).map(([model, usage]) =>
    usageRow(model, usage),
  )
  return models.length > 0 ? { models } : undefined
}

function usageRow(model: string, usage: unknown): ModelUsageRow {
  if (!isObject(usage)) return { model }
  return {
    model,
    ...(typeof usage.inputTokens === 'number' && {
      inputTokens: usage.inputTokens,
    }),
    ...(typeof usage.outputTokens === 'number' && {
      outputTokens: usage.outputTokens,
    }),
    ...(typeof usage.cacheReadInputTokens === 'number' && {
      cacheReadInputTokens: usage.cacheReadInputTokens,
    }),
    ...(typeof usage.cacheCreationInputTokens === 'number' && {
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    }),
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
