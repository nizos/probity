import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'
import type { FileWriteInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools'

import type { Vendor } from '../../../src/cli.js'

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
    session_id: 'scenario',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_use_id: 'tu_scenario',
    tool_input: { file_path: opts.filePath, content: opts.content },
  }
}

function createCodexWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CodexWriteAction {
  return {
    session_id: 'scenario',
    turn_id: 'turn-scenario',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.5',
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: {
      command: `*** Begin Patch\n*** Add File: ${opts.filePath}\n+${opts.content}\n*** End Patch\n`,
    },
    tool_use_id: 'tu_scenario',
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
    session_id: 'scenario',
    transcript_path: '/tmp/transcript.jsonl',
    tool_name: 'create_file',
    tool_input: { filePath: opts.filePath, content: opts.content },
    tool_use_id: 'tu_scenario',
    cwd: opts.cwd,
  }
}

function createCopilotWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CopilotWriteAction {
  return {
    sessionId: 'scenario',
    timestamp: 0,
    cwd: opts.cwd,
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: opts.filePath,
      file_text: opts.content,
    }),
  }
}
