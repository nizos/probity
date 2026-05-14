import { mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PreToolUseHookOutput } from '@github/copilot/sdk'
import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import { expectDecision } from './helpers/expect-decision.js'

const runAi = process.env.PROBITY_INTEGRATION_AI === '1'

const CLEAN_SESSION = 'integration-copilot-tdd-clean'
const NO_RUN_SESSION = 'integration-copilot-tdd-no-run'
const CYCLE_COMPLETED_SESSION = 'integration-copilot-tdd-cycle-completed'

describe.skipIf(!runAi)('enforce-tdd + github-copilot (integration)', () => {
  it('allows a minimal add implementation after a failing test was run', async () => {
    const result = await setup({
      sessionId: CLEAN_SESSION,
      pendingContent: MINIMAL_IMPL,
    })

    expectDecision(result, 'allow')
  }, 60000)

  it('blocks an over-implementation that adds many unrequested functions', async () => {
    const result = await setup({
      sessionId: CLEAN_SESSION,
      pendingContent: OVER_IMPL,
    })

    expectDecision(result, 'deny')
  }, 60000)

  it('blocks implementation when the failing test has not been run', async () => {
    const result = await setup({
      sessionId: NO_RUN_SESSION,
      pendingContent: MINIMAL_IMPL,
    })

    expectDecision(result, 'deny')
  }, 60000)

  it('allows adding a second test to an existing test file', async () => {
    const result = await setup({
      sessionId: CYCLE_COMPLETED_SESSION,
      beforeFile: EXISTING_TEST_CONTENT,
      pendingContent: PLUS_ONE_TEST,
    })

    expectDecision(result, 'allow')
  }, 60000)

  it('blocks when two new tests are added in a single write', async () => {
    const result = await setup({
      sessionId: CYCLE_COMPLETED_SESSION,
      beforeFile: EXISTING_TEST_CONTENT,
      pendingContent: PLUS_TWO_TESTS,
    })

    expectDecision(result, 'deny')
  }, 60000)
})

function inferFilename(content: string): string {
  return /describe\(|\bit\(/.test(content) ? 'target.test.ts' : 'target.ts'
}

async function setup(opts: {
  sessionId: string
  pendingContent: string
  beforeFile?: string
}): Promise<{ decision: string; reason?: string }> {
  const home = await mkdtemp(path.join(tmpdir(), 'probity-copilot-tdd-'))
  for (const [session, fixture] of [
    [CLEAN_SESSION, 'copilot-tdd-clean.jsonl'],
    [NO_RUN_SESSION, 'copilot-tdd-no-test-run.jsonl'],
    [CYCLE_COMPLETED_SESSION, 'copilot-tdd-cycle-completed.jsonl'],
  ] as const) {
    const sessionDir = path.join(home, 'session-state', session)
    await mkdir(sessionDir, { recursive: true })
    await cp(
      `test/fixtures/transcripts/${fixture}`,
      path.join(sessionDir, 'events.jsonl'),
    )
  }
  const prevHome = process.env.COPILOT_HOME
  process.env.COPILOT_HOME = home
  const fileDir = await mkdtemp(path.join(tmpdir(), 'probity-copilot-file-'))
  onTestFinished(async () => {
    if (prevHome === undefined) delete process.env.COPILOT_HOME
    else process.env.COPILOT_HOME = prevHome
    await rm(home, { recursive: true, force: true })
    await rm(fileDir, { recursive: true, force: true })
  })
  const filePath = path.join(fileDir, inferFilename(opts.pendingContent))
  if (opts.beforeFile !== undefined) {
    await writeFile(filePath, opts.beforeFile)
  }
  const payload = JSON.stringify({
    sessionId: opts.sessionId,
    timestamp: Date.now(),
    cwd: '/workspaces/probity',
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: filePath,
      file_text: opts.pendingContent,
    }),
  })
  const response = await run(payload, {
    vendor: 'github-copilot',
    loadConfig: () => Promise.resolve({ rules: [enforceTdd()] }),
  })
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<PreToolUseHookOutput>(response)
  return {
    decision: parsed.permissionDecision ?? 'allow',
    ...(parsed.permissionDecisionReason !== undefined && {
      reason: parsed.permissionDecisionReason,
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

const MINIMAL_IMPL = `export function add(a: number, b: number): number {
  return a + b
}
`

const OVER_IMPL = `export function add(a: number, b: number): number { return a + b }
export function subtract(a: number, b: number): number { return a - b }
export function multiply(a: number, b: number): number { return a * b }
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero')
  return a / b
}
export function power(a: number, b: number): number { return Math.pow(a, b) }
export function sqrt(a: number): number { return Math.sqrt(a) }

export class Calculator {
  private history: Array<{ op: string; result: number }> = []
  add(a: number, b: number): number {
    const r = a + b
    this.history.push({ op: 'add', result: r })
    return r
  }
  clear(): void {
    this.history = []
  }
}
`
