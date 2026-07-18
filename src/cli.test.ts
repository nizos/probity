import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, onTestFinished } from 'vitest'

import { failClosedResponse, run, type RunResult, type Vendor } from './cli.js'
import type { Config } from './config.js'
import type { Agent, SessionEvent } from './types.js'
import { enforceTdd } from './rules/enforce-tdd.js'
import { enforceFilenameCasing } from './rules/enforce-filename-casing.js'
import { forbidContentPattern } from './rules/forbid-content-pattern.js'
import type { FileContent, Rule } from './rules/contract.js'
import { parseAs } from './utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from './vendors/claude-code/adapter.js'

const stubAgent: Agent = {
  reason: () => Promise.resolve({ kind: 'pass', reason: '' }),
}

describe('cli', () => {
  it('denies a write whose filename violates kebab-case', async () => {
    const { response } = await setup({ fixture: 'write-new-file.json' })
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('surfaces the engine trace alongside the response', async () => {
    const { response, trace } = await setup({
      fixture: 'write-kebab-case.json',
    })

    expect(response).toBe('')
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({
      kind: 'rule-evaluated',
      result: { kind: 'pass' },
    })
  })

  it('brands deny reasons with the Probity: prefix', async () => {
    const { response } = await setup({ fixture: 'write-new-file.json' })
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(
      /^Probity: /,
    )
  })

  it('produces a branded vendor block response from an error via failClosedResponse', () => {
    const response = failClosedResponse('claude-code', new Error('boom'))
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe(
      'Probity: boom',
    )
  })

  it('returns no opinion (empty stdout) for a write that passes every rule', async () => {
    const { response } = await setup({ fixture: 'write-kebab-case.json' })

    expect(response).toBe('')
  })

  it('produces an empty allow response for a codex Bash payload that passes rules', async () => {
    const { response } = await setup({
      vendor: 'codex',
      fixture: 'pre-bash-pwd.json',
    })

    expect(response).toBe('')
  })

  it('produces an empty allow response for a github-copilot bash payload that passes rules', async () => {
    const { response } = await setup({
      vendor: 'github-copilot',
      fixture: 'pre-bash-npm-test.json',
    })

    expect(response).toBe('')
  })

  it('returns a deny response when the payload is not valid JSON', async () => {
    const { response } = await setup({
      payload: 'not json at all',
      config: { rules: [], ai: stubAgent },
    })
    const parsed = parseAs<ClaudeCodeResponse>(response)

    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(
      /json|parse/i,
    )
  })

  it('emits a parse-failed trace entry naming the rejection reason', async () => {
    const { trace } = await setup({
      payload: 'not json at all',
      config: { rules: [], ai: stubAgent },
    })

    expect(trace).toHaveLength(1)
    const first = trace[0]
    if (first?.kind !== 'parse-failed') {
      expect.fail(`expected parse-failed; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.reason).toMatch(/json|parse/i)
  })

  it('honors an injected config loader instead of discovering one on disk', async () => {
    const injectedConfig: Config = {
      rules: [
        {
          files: ['**/src/**', '**/test/**'],
          rules: [enforceFilenameCasing({ style: 'kebab-case' })],
        },
      ],
      ai: stubAgent,
    }

    const { response } = await setup({
      fixture: 'write-kebab-case.json',
      config: injectedConfig,
    })

    expect(response).toBe('')
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

    await setup({
      payload,
      config: { rules: [captureRule], ai: stubAgent },
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

    await setup({
      fixture: 'write-kebab-case.json',
      config: { rules: [captureRule], ai: stubAgent },
    })

    expect(captured).toBeDefined()
    expect(captured?.kind).toBe('present')
  })

  it('preserves a large Edit delta through parsing and dispatch while other rules still receive the full post-image', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'probity-cli-edit-delta-'))
    onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true })
    })
    const filePath = path.join(dir, 'large.ts')
    const unchanged = 'UNCHANGED_CLI_CONTEXT\n'.repeat(10_000)
    await writeFile(filePath, `${unchanged}oldName()${unchanged}`)
    let capturedContent = ''
    let capturedPrompt = ''
    const captureContent: Rule = (action) => {
      if (action.kind === 'write') capturedContent = action.content
      return Promise.resolve({ kind: 'pass' })
    }
    const agent: Agent = {
      reason: (prompt) => {
        capturedPrompt = prompt
        return Promise.resolve({ kind: 'pass', reason: '' })
      },
    }
    const payload = JSON.stringify({
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'oldName()',
        new_string: 'newName()',
      },
    })

    await setup({
      payload,
      config: { rules: [captureContent, enforceTdd()], ai: agent },
    })

    expect(capturedContent).toContain('UNCHANGED_CLI_CONTEXT')
    expect(capturedContent).toContain('newName()')
    expect(capturedPrompt).toContain('oldName()')
    expect(capturedPrompt).toContain('newName()')
    expect(capturedPrompt).not.toContain('UNCHANGED_CLI_CONTEXT')
    expect(capturedPrompt.length).toBeLessThan(10_000)
  })

  it('captures agent calls a rule makes onto the trace entry as agentCalls with the full Verdict embedded', async () => {
    const meta = { model: 'test-model', inputTokens: 100, outputTokens: 20 }
    const meteringAgent: Agent = {
      reason: () => Promise.resolve({ kind: 'pass', reason: 'ok', meta }),
    }
    const aiRule: Rule = async (_action, ctx) => {
      await ctx?.agent?.reason('hi')
      return { kind: 'pass' }
    }

    const { trace } = await setup({
      fixture: 'write-kebab-case.json',
      config: { rules: [aiRule], ai: meteringAgent },
    })

    expect(trace).toHaveLength(1)
    const first = trace[0]
    if (first?.kind !== 'rule-evaluated') {
      expect.fail(`expected rule-evaluated; got ${first?.kind ?? 'no entry'}`)
    }
    expect(first.agentCalls).toHaveLength(1)
    const call = first.agentCalls?.[0]
    expect(call?.durationMs).toBeGreaterThanOrEqual(0)
    expect(call?.verdict).toEqual({ kind: 'pass', reason: 'ok', meta })
  })

  it('checks every file in a multi-file codex apply_patch (a later file cannot escape a path-scoped rule)', async () => {
    const payload = JSON.stringify({
      cwd: '/workspaces/probity',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n' +
          '*** Add File: /workspaces/probity/src/ok.ts\n+fine\n' +
          '*** Add File: /workspaces/probity/secret/leak.ts\n+FORBIDDEN\n' +
          '*** End Patch\n',
      },
    })

    const { response } = await setup({
      vendor: 'codex',
      payload,
      config: {
        rules: [
          {
            files: ['**/secret/**'],
            rules: [
              forbidContentPattern({ match: 'FORBIDDEN', reason: 'no leaks' }),
            ],
          },
        ],
        ai: stubAgent,
      },
    })
    const parsed = parseAs<{ decision: string; reason: string }>(response)

    expect(parsed.decision).toBe('block')
    expect(parsed.reason).toMatch(/no leaks/)
  })

  it('scopes AI-call trace attribution to the action that made the call across a multi-file patch', async () => {
    const agent: Agent = {
      reason: () => Promise.resolve({ kind: 'pass', reason: 'ok' }),
    }
    const aiRule: Rule = async (_action, ctx) => {
      await ctx?.agent?.reason('hi')
      return { kind: 'pass' }
    }
    const payload = JSON.stringify({
      cwd: '/workspaces/probity',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n' +
          '*** Add File: src/f1.ts\n+a\n' +
          '*** Add File: src/f2.ts\n+b\n' +
          '*** End Patch\n',
      },
    })

    const { trace } = await setup({
      vendor: 'codex',
      payload,
      config: { rules: [aiRule], ai: agent },
    })

    const evaluated = trace.filter((t) => t.kind === 'rule-evaluated')
    expect(evaluated).toHaveLength(2)
    for (const entry of evaluated) {
      if (entry.kind !== 'rule-evaluated') continue
      expect(entry.agentCalls).toHaveLength(1)
    }
  })

  it('returns a deny response when the adapter rejects the payload', async () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: {} })

    const { response } = await setup({
      payload,
      config: { rules: [], ai: stubAgent },
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

async function setup(
  opts: {
    vendor?: Vendor
    fixture?: string
    payload?: string
    config?: Config
  } = {},
): Promise<RunResult> {
  const vendor = opts.vendor ?? 'claude-code'
  const payload =
    opts.payload ??
    (opts.fixture
      ? readFileSync(`test/fixtures/${vendor}/${opts.fixture}`, 'utf8')
      : '')
  return run(payload, {
    vendor,
    loadConfig: () => Promise.resolve(opts.config ?? defaultTestConfig),
  })
}
