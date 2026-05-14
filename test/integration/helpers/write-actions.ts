import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'
import type { FileWriteInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools'

import type { Vendor } from '../../../src/cli.js'

// Stub values used to satisfy each vendor's required hook-payload
// fields. The bin reads them but doesn't gate on them; the exact
// values aren't meaningful. STUB_MODEL is a fictional version string.
const STUB_SESSION_ID = 'scenario'
const STUB_TRANSCRIPT_PATH = '/tmp/transcript.jsonl'
const STUB_TOOL_USE_ID = 'tu_scenario'
const STUB_MODEL = 'gpt-5.5'

export type ClaudeCodeWriteAction = Omit<
  PreToolUseHookInput,
  'tool_name' | 'tool_input'
> & {
  tool_name: 'Write'
  tool_input: FileWriteInput
}

export type CodexWriteAction = {
  session_id: string
  turn_id: string
  transcript_path: string
  cwd: string
  hook_event_name: 'PreToolUse'
  model: string
  permission_mode: string
  tool_name: 'apply_patch'
  tool_input: { command: string }
  tool_use_id: string
}

export type CopilotChatWriteAction = {
  timestamp: string
  hook_event_name: 'PreToolUse'
  session_id: string
  transcript_path: string
  tool_name: 'create_file'
  tool_input: { filePath: string; content: string }
  tool_use_id: string
  cwd: string
}

export type CopilotWriteAction = {
  sessionId: string
  timestamp: number
  cwd: string
  toolName: 'create'
  toolArgs: string
}

export type WriteAction =
  | ClaudeCodeWriteAction
  | CodexWriteAction
  | CopilotChatWriteAction
  | CopilotWriteAction

export type WriteActionOpts = {
  agent: Vendor
  cwd: string
  filePath: string
  content: string
}

// Builds the raw hook payload each vendor's adapter expects on a write
// action (Write / apply_patch / create_file / create). Tests stringify
// the result and pipe it to `runBin` to drive the bin end-to-end.
export function createWriteAction(opts: WriteActionOpts): WriteAction {
  switch (opts.agent) {
    case 'claude-code':
      return createClaudeCodeWriteAction(opts)
    case 'codex':
      return createCodexWriteAction(opts)
    case 'github-copilot-chat':
      return createCopilotChatWriteAction(opts)
    case 'github-copilot':
      return createCopilotWriteAction(opts)
  }
}

function createClaudeCodeWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): ClaudeCodeWriteAction {
  return {
    session_id: STUB_SESSION_ID,
    transcript_path: STUB_TRANSCRIPT_PATH,
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_use_id: STUB_TOOL_USE_ID,
    tool_input: { file_path: opts.filePath, content: opts.content },
  }
}

function createCodexWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CodexWriteAction {
  return {
    session_id: STUB_SESSION_ID,
    turn_id: 'turn-scenario',
    transcript_path: STUB_TRANSCRIPT_PATH,
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    model: STUB_MODEL,
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: {
      command: `*** Begin Patch\n*** Add File: ${opts.filePath}\n+${opts.content}\n*** End Patch\n`,
    },
    tool_use_id: STUB_TOOL_USE_ID,
  }
}

function createCopilotChatWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CopilotChatWriteAction {
  return {
    timestamp: '2026-05-13T00:00:00.000Z',
    hook_event_name: 'PreToolUse',
    session_id: STUB_SESSION_ID,
    transcript_path: STUB_TRANSCRIPT_PATH,
    tool_name: 'create_file',
    tool_input: { filePath: opts.filePath, content: opts.content },
    tool_use_id: STUB_TOOL_USE_ID,
    cwd: opts.cwd,
  }
}

function createCopilotWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CopilotWriteAction {
  return {
    sessionId: STUB_SESSION_ID,
    timestamp: 0,
    cwd: opts.cwd,
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: opts.filePath,
      file_text: opts.content,
    }),
  }
}
