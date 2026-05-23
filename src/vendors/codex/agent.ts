import type { ThreadOptions } from '@openai/codex-sdk'

import type { Agent, AgentMeta } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

type CodexLike = {
  startThread(options?: ThreadOptions): {
    run(input: string): Promise<{
      finalResponse: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
      } | null
    }>
  }
}

export function codex(deps: { codex?: CodexLike } = {}): Agent {
  return {
    reason: (prompt) =>
      toVerdict(async () => {
        const instance = deps.codex ?? (await loadDefaultCodex())
        const thread = instance.startThread({
          skipGitRepoCheck: true,
          sandboxMode: 'read-only',
          approvalPolicy: 'never',
          networkAccessEnabled: false,
          webSearchEnabled: false,
        })
        const turn = await thread.run(prompt)
        const meta = buildMeta(turn.usage)
        return meta
          ? { text: turn.finalResponse, meta }
          : { text: turn.finalResponse }
      }),
  }
}

async function loadDefaultCodex(): Promise<CodexLike> {
  const mod = await import('@openai/codex-sdk')
  return new mod.Codex()
}

function buildMeta(
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
): AgentMeta | undefined {
  const meta: AgentMeta = {}
  if (usage && typeof usage.input_tokens === 'number') {
    meta.inputTokens = usage.input_tokens
  }
  if (usage && typeof usage.output_tokens === 'number') {
    meta.outputTokens = usage.output_tokens
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}
