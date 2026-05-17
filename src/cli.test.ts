import { readFileSync } from 'node:fs'

import { describe, it, expect } from 'vitest'

import { run } from './cli.js'
import type { Config } from './config.js'
import type { Agent, SessionEvent } from './types.js'
import { enforceFilenameCasing } from './rules/enforce-filename-casing.js'
import type { FileContent, Rule } from './rules/contract.js'
import { parseAs } from './utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from './vendors/claude-code/adapter.js'

const stubAgent: Agent = {
  reason: () => Promise.resolve({ kind: 'pass', reason: '' }),
}

describe('cli', () => {
  it('denies a write whose filename violates kebab-case', async () => {
    const { raw } = await setup('write-new-file.json')
    const response = parseAs<ClaudeCodeResponse>(raw)

    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('returns no opinion (empty stdout) for a write that passes every rule', async () => {
    const { raw } = await setup('write-kebab-case.json')

    expect(raw).toBe('')
  })

  it('produces an empty allow response for a codex Bash payload that passes rules', async () => {
    const payload = readFileSync(
      'test/fixtures/codex/pre-bash-pwd.json',
      'utf8',
    )

    const response = await run(payload, {
      vendor: 'codex',
      loadConfig: () => Promise.resolve(defaultTestConfig),
    })

    expect(response).toBe('')
  })

  it('produces an empty allow response for a github-copilot bash payload that passes rules', async () => {
    const payload = readFileSync(
      'test/fixtures/github-copilot/pre-bash-npm-test.json',
      'utf8',
    )

    const response = await run(payload, {
      vendor: 'github-copilot',
      loadConfig: () => Promise.resolve(defaultTestConfig),
    })

    expect(response).toBe('')
  })

  it('returns a deny response when the payload is not valid JSON', async () => {
    const response = await run('not json at all', {
      vendor: 'claude-code',
      loadConfig: () => Promise.resolve({ rules: [], ai: stubAgent }),
    })
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(
      /json|parse/i,
    )
  })

  it('honors an injected config loader instead of discovering one on disk', async () => {
    const payload = readFileSync(
      'test/fixtures/claude-code/write-kebab-case.json',
      'utf8',
    )
    const injectedConfig: Config = {
      rules: [
        {
          files: ['**/src/**', '**/test/**'],
          rules: [enforceFilenameCasing({ style: 'kebab-case' })],
        },
      ],
      ai: stubAgent,
    }

    const raw = await run(payload, {
      vendor: 'claude-code',
      loadConfig: () => Promise.resolve(injectedConfig),
    })

    expect(raw).toBe('')
  })

  it('threads canonical session events into ctx.history when a transcript is available', async () => {
    let captured: SessionEvent[] | undefined
    const captureRule: Rule = async (_action, ctx) => {
      captured = await ctx?.history?.()
      return { kind: 'pass' }
    }
    const payload = JSON.stringify({
      session_id: 'x',
      transcript_path: 'test/fixtures/transcripts/tdd-clean.jsonl',
      cwd: '/workspaces/probity',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo hi' },
      tool_use_id: 'tu_x',
    })

    await run(payload, {
      vendor: 'claude-code',
      loadConfig: () =>
        Promise.resolve({ rules: [captureRule], ai: stubAgent }),
    })

    expect(captured).toBeDefined()
    expect(captured?.some((e) => e.kind === 'command')).toBe(true)
  })

  it('threads a ctx.readFile capability into the RuleContext for write actions', async () => {
    let captured: FileContent | undefined
    const captureRule: Rule = async (_action, ctx) => {
      captured = await ctx?.readFile?.(
        'test/fixtures/transcripts/tdd-clean.jsonl',
      )
      return { kind: 'pass' }
    }
    const payload = readFileSync(
      'test/fixtures/claude-code/write-kebab-case.json',
      'utf8',
    )

    await run(payload, {
      vendor: 'claude-code',
      loadConfig: () =>
        Promise.resolve({ rules: [captureRule], ai: stubAgent }),
    })

    expect(captured).toBeDefined()
    expect(captured?.kind).toBe('present')
  })

  it('returns a deny response when the adapter rejects the payload', async () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: {} })

    const response = await run(payload, {
      vendor: 'claude-code',
      loadConfig: () => Promise.resolve({ rules: [], ai: stubAgent }),
    })
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(
      /invalid hook payload/i,
    )
  })
})

const defaultTestConfig: Config = {
  rules: [
    {
      files: ['**/src/**', '**/test/**'],
      rules: [enforceFilenameCasing({ style: 'kebab-case' })],
    },
  ],
  ai: stubAgent,
}

async function setup(fixtureName: string, config: Config = defaultTestConfig) {
  const payload = readFileSync(
    `test/fixtures/claude-code/${fixtureName}`,
    'utf8',
  )
  const raw = await run(payload, {
    vendor: 'claude-code',
    loadConfig: () => Promise.resolve(config),
  })
  return { raw }
}
