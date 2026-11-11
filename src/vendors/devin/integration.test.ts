import { createFixture } from 'fs-fixture'
import { describe, expect, it } from 'vitest'
import { run } from '../../cli.js'
import { main } from '../../bin.js'
import { parseAs } from '../../utils/parse-as.js'
import { enforceTdd } from '../../rules/enforce-tdd.js'
import { forbidCommandPattern } from '../../rules/forbid-command-pattern.js'

describe('Devin policy dispatch', () => {
  it('records prompts and completed results without evaluating authorization rules', async () => {
    const fixture = await createFixture({})
    try {
      const loadConfig = () =>
        Promise.resolve({
          rules: [
            () => {
              throw new Error('Only proposed actions can be authorized')
            },
          ],
        })
      const base = { cwd: fixture.path, session_id: 'record-only' }
      for (const payload of [
        {
          ...base,
          hook_event_name: 'UserPromptSubmit',
          prompt: 'Check the cart',
        },
        {
          ...base,
          hook_event_name: 'PostToolUse',
          tool_name: 'exec',
          tool_input: { command: 'python -m unittest' },
          tool_use_id: 'red',
          tool_response: {
            success: true,
            output: 'AssertionError: 0 != 30',
            error: null,
          },
        },
      ]) {
        const result = await run(JSON.stringify(payload), {
          vendor: 'devin',
          loadConfig,
        })
        expect(result.response).toBe('')
        expect(result.trace).toEqual([])
      }
      const { readTranscript } = await import('./history.js')
      const history = await readTranscript(
        `${fixture.path}/.probity/devin/record-only.jsonl`,
      )
      expect(history).toHaveLength(2)
      expect(history[1]).toMatchObject({ output: 'AssertionError: 0 != 30' })
    } finally {
      await fixture.rm()
    }
  })

  it('blocks a native exec command and allows a harmless command', async () => {
    const fixture = await createFixture({})
    try {
      const loadConfig = () =>
        Promise.resolve({
          rules: [
            forbidCommandPattern({
              match: /--no-verify/,
              reason: 'Checks are required',
            }),
          ],
        })
      const payload = {
        cwd: fixture.path,
        session_id: 'policy',
        hook_event_name: 'PreToolUse',
        tool_name: 'exec',
        tool_input: { command: 'git push --no-verify' },
      }
      const denied = await run(JSON.stringify(payload), {
        vendor: 'devin',
        loadConfig,
      })
      expect(parseAs<unknown>(denied.response)).toMatchObject({
        decision: 'block',
        reason: 'Probity: Checks are required',
      })
      const allowed = await run(
        JSON.stringify({ ...payload, tool_input: { command: 'git status' } }),
        { vendor: 'devin', loadConfig },
      )
      expect(allowed.response).toBe('')
    } finally {
      await fixture.rm()
    }
  })

  it('delivers the recorded assertion output to TDD and refuses an absent AI validator', async () => {
    const fixture = await createFixture({
      'cart.py': 'def total(items): return 0',
    })
    try {
      const base = { cwd: fixture.path, session_id: 'cart-session' }
      const loadConfig = () =>
        Promise.resolve({
          rules: [enforceTdd({ fastPath: false })],
          ai: {
            reason: (prompt: string) => {
              expect(prompt).toContain('AssertionError: 0 != 30')
              expect(prompt).toContain('python -m unittest')
              return Promise.resolve({
                kind: 'pass' as const,
                reason: 'Transport checked; not an AI behavior test',
              })
            },
          },
        })
      await run(
        JSON.stringify({
          ...base,
          hook_event_name: 'PostToolUse',
          tool_name: 'exec',
          tool_input: { command: 'python -m unittest' },
          tool_use_id: 'red',
          tool_response: {
            success: true,
            output: 'AssertionError: 0 != 30\nExit code: 1',
            error: null,
          },
        }),
        { vendor: 'devin', loadConfig },
      )
      const write = JSON.stringify({
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: 'cart.py',
          content: 'def total(items): return sum(items)',
        },
      })
      expect((await run(write, { vendor: 'devin', loadConfig })).response).toBe(
        '',
      )
      const denied = await run(write, {
        vendor: 'devin',
        loadConfig: () =>
          Promise.resolve({ rules: [enforceTdd({ fastPath: false })] }),
      })
      expect(
        parseAs<{ decision: string; reason: string }>(denied.response).decision,
      ).toBe('block')
      expect(parseAs<{ reason: string }>(denied.response).reason).toContain(
        'Config.ai',
      )
    } finally {
      await fixture.rm()
    }
  })

  it('blocks a malformed session before a known write can bypass policy', async () => {
    const fixture = await createFixture({})
    try {
      const result = await main({
        argv: ['node', 'probity', '--agent', 'devin'],
        stdin: JSON.stringify({
          cwd: fixture.path,
          session_id: '../escape',
          hook_event_name: 'PreToolUse',
          tool_name: 'write',
          tool_input: {},
        }),
        loadConfig: () => Promise.resolve({ rules: [] }),
      })
      expect(result.exitCode).toBe(0)
      expect(parseAs<{ decision: string }>(result.stdout ?? '').decision).toBe(
        'block',
      )
      expect(parseAs<{ reason: string }>(result.stdout ?? '').reason).toContain(
        'Probity:',
      )
    } finally {
      await fixture.rm()
    }
  })
})
