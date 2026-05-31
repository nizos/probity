import type { Vendor } from '../../src/cli.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
import type { ResponseShape as CopilotResponse } from '../../src/vendors/github-copilot/adapter.js'

export type DecodedResponse = { decision: 'allow' | 'deny'; reason?: string }

/**
 * Normalizes each vendor's deny shape (claude-code/copilot-chat nest under
 * hookSpecificOutput; codex says `block` while others say `deny`) into a
 * single `{ decision, reason }` so tests can assert against one shape.
 */
export function decodeResponse(agent: Vendor, stdout: string): DecodedResponse {
  if (stdout === '') return { decision: 'allow' }
  return decoders[agent](stdout)
}

const decoders: Record<Vendor, (stdout: string) => DecodedResponse> = {
  'claude-code': decodeClaudeShape,
  'github-copilot-chat': decodeClaudeShape,
  codex: decodeCodexShape,
  'github-copilot': decodeCopilotShape,
}

function decodeClaudeShape(stdout: string): DecodedResponse {
  const out = parseAs<ClaudeCodeResponse>(stdout).hookSpecificOutput
  return {
    decision: out.permissionDecision === 'deny' ? 'deny' : 'allow',
    ...(out.permissionDecisionReason !== undefined && {
      reason: out.permissionDecisionReason,
    }),
  }
}

function decodeCodexShape(stdout: string): DecodedResponse {
  const out = parseAs<CodexResponse>(stdout)
  return {
    decision: out.decision === 'block' ? 'deny' : 'allow',
    ...(out.reason !== undefined && { reason: out.reason }),
  }
}

function decodeCopilotShape(stdout: string): DecodedResponse {
  const out = parseAs<CopilotResponse>(stdout)
  return {
    decision: out.permissionDecision === 'deny' ? 'deny' : 'allow',
    ...(out.permissionDecisionReason !== undefined && {
      reason: out.permissionDecisionReason,
    }),
  }
}
