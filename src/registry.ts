import type { Agent, RawSessionEvent, SessionEvent } from './types.js'
import type { Adapter } from './vendors/adapter.js'
import { claudeCode } from './vendors/claude-code/agent.js'
import * as claudeCodeAdapter from './vendors/claude-code/adapter.js'
import { toCanonical as claudeCodeToCanonical } from './vendors/claude-code/event.js'
import { readTranscript as readClaudeCodeTranscript } from './vendors/claude-code/transcript.js'
import { codex } from './vendors/codex/agent.js'
import * as codexAdapter from './vendors/codex/adapter.js'
import { toCanonical as codexToCanonical } from './vendors/codex/event.js'
import { readTranscript as readCodexTranscript } from './vendors/codex/transcript.js'
import { githubCopilot } from './vendors/github-copilot/agent.js'
import * as githubCopilotAdapter from './vendors/github-copilot/adapter.js'
import { toCanonical as githubCopilotToCanonical } from './vendors/github-copilot/event.js'
import { readTranscript as readGithubCopilotTranscript } from './vendors/github-copilot/transcript.js'
import * as githubCopilotChatAdapter from './vendors/github-copilot-chat/adapter.js'
import { toCanonical as githubCopilotChatToCanonical } from './vendors/github-copilot-chat/event.js'
import { readTranscript as readGithubCopilotChatTranscript } from './vendors/github-copilot-chat/transcript.js'
import { opencode } from './vendors/opencode/agent.js'
import * as opencodeAdapter from './vendors/opencode/adapter.js'
import { toCanonical as opencodeToCanonical } from './vendors/opencode/event.js'
import { readTranscript as readOpenCodeTranscript } from './vendors/opencode/transcript.js'

/**
 * Each vendor entry bundles the vendor-specific pieces the engine
 * needs: the adapter (payload/response translation), the agent factory
 * (AI validator — sync, lazy SDK load), the transcript reader (session
 * log → RawSessionEvent[]), and an optional toCanonical that maps a
 * raw event to its canonical SessionEvent shape (vendors gain this as
 * their classifier ships).
 */
export type VendorEntry = {
  adapter: Adapter
  agent: () => Agent
  readTranscript: (path: string) => Promise<RawSessionEvent[]>
  toCanonical?: (event: RawSessionEvent) => SessionEvent
}

export const vendors = {
  'claude-code': {
    adapter: claudeCodeAdapter,
    agent: claudeCode,
    readTranscript: readClaudeCodeTranscript,
    toCanonical: claudeCodeToCanonical,
  },
  codex: {
    adapter: codexAdapter,
    agent: codex,
    readTranscript: readCodexTranscript,
    toCanonical: codexToCanonical,
  },
  'github-copilot': {
    adapter: githubCopilotAdapter,
    agent: githubCopilot,
    readTranscript: readGithubCopilotTranscript,
    toCanonical: githubCopilotToCanonical,
  },
  'github-copilot-chat': {
    adapter: githubCopilotChatAdapter,
    agent: githubCopilot,
    readTranscript: readGithubCopilotChatTranscript,
    toCanonical: githubCopilotChatToCanonical,
  },
  opencode: {
    adapter: opencodeAdapter,
    agent: opencode,
    readTranscript: readOpenCodeTranscript,
    toCanonical: opencodeToCanonical,
  },
} satisfies Record<string, VendorEntry>

export type Vendor = keyof typeof vendors

export function isVendor(value: unknown): value is Vendor {
  return typeof value === 'string' && Object.hasOwn(vendors, value)
}
