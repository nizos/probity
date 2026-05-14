import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import { expectDecision } from './expect-decision.js'

const runAi = process.env.PROBITY_INTEGRATION_AI === '1'

describe.skipIf(!runAi)('enforce-tdd (integration with real AI)', () => {
  it('allows clean TDD with minimal implementation', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-clean.jsonl',
      pendingContent:
        'export const add = (a: number, b: number): number => a + b\n',
    })

    expectDecision(result, 'allow')
  }, 60000)

  it('blocks clear over-implementation', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-over-impl.jsonl',
      pendingContent: OVER_IMPL,
    })

    expectDecision(result, 'deny')
  }, 60000)

  it('blocks implementation when the failing test has not been run', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-no-test-run.jsonl',
      pendingContent:
        'export const add = (a: number, b: number): number => a + b\n',
    })

    expectDecision(result, 'deny')
  }, 60000)

  it('allows adding a second test to an existing test file', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
      beforeFile: EXISTING_TEST_CONTENT,
      pendingContent: PLUS_ONE_TEST,
    })

    expectDecision(result, 'allow')
  }, 60000)

  it('blocks when two new tests are added in a single write', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
      beforeFile: EXISTING_TEST_CONTENT,
      pendingContent: PLUS_TWO_TESTS,
    })

    expectDecision(result, 'deny')
  }, 60000)

  it('allows a stub when a recent failing test is buried under noisy follow-up reads', async () => {
    const result = await setup({
      transcript: 'test/fixtures/transcripts/tdd-noisy-buried-failure.jsonl',
      pendingContent:
        'export const modulo = (a: number, b: number): number => 0\n',
    })

    expectDecision(result, 'allow')
  }, 60000)
})

function inferFilename(content: string): string {
  return /describe\(|\bit\(/.test(content) ? 'target.test.ts' : 'target.ts'
}

async function setup(opts: {
  transcript: string
  pendingContent: string
  beforeFile?: string
}): Promise<{ decision: string; reason?: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'enforce-tdd-claude-'))
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  const filePath = path.join(dir, inferFilename(opts.pendingContent))
  if (opts.beforeFile !== undefined) {
    await writeFile(filePath, opts.beforeFile)
  }
  const payload = JSON.stringify({
    session_id: 'integration',
    transcript_path: opts.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: opts.pendingContent },
    tool_use_id: 'toolu_integration',
  })
  const response = await run(payload, {
    vendor: 'claude-code',
    loadConfig: () => Promise.resolve({ rules: [enforceTdd()] }),
  })
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<ClaudeCodeResponse>(response)
  return {
    decision: parsed.hookSpecificOutput.permissionDecision ?? 'allow',
    ...(parsed.hookSpecificOutput.permissionDecisionReason !== undefined && {
      reason: parsed.hookSpecificOutput.permissionDecisionReason,
    }),
  }
}

const EXISTING_TEST_CONTENT = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})
`

const PLUS_ONE_TEST = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })
})
`

const PLUS_TWO_TESTS = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })

  it('adds zeros', () => {
    expect(add(0, 0)).toBe(0)
  })
})
`

const OVER_IMPL = `export const add = (a: number, b: number): number => a + b
export const subtract = (a: number, b: number): number => a - b
export const multiply = (a: number, b: number): number => a * b
export const divide = (a: number, b: number): number => {
  if (b === 0) throw new Error('division by zero')
  return a / b
}
export const power = (a: number, b: number): number => Math.pow(a, b)
export const sqrt = (a: number): number => Math.sqrt(a)

export class Calculator {
  private history: Array<{ op: string; result: number }> = []

  add(a: number, b: number): number {
    const r = a + b
    this.history.push({ op: 'add', result: r })
    return r
  }
  subtract(a: number, b: number): number {
    const r = a - b
    this.history.push({ op: 'subtract', result: r })
    return r
  }
  clear(): void {
    this.history = []
  }
}
`
