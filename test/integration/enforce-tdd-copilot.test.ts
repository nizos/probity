import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { PreToolUseHookOutput } from '@github/copilot/sdk'
import { describe, expect, test as baseTest } from 'vitest'

// Mute the experimental-feature warning that copilot's CLI subprocess emits via
// node:sqlite. Scoped to this file's worker by vitest's per-file isolation.
process.env.NODE_NO_WARNINGS = '1'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import { githubCopilot } from '../../src/vendors/github-copilot/agent.js'
import { preflightAuth, skipIfUnauthed } from './helpers/preflight-auth.js'
import { makeSandboxDir } from './helpers/sandbox.js'
import {
  EXISTING_TEST_CONTENT,
  MINIMAL_IMPL,
  OVER_IMPL,
  PLUS_ONE_TEST,
  PLUS_TWO_TESTS,
} from './helpers/tdd-fixtures.js'

const T = {
  clean: 'test/fixtures/transcripts/copilot-tdd-clean.jsonl',
  noTestRun: 'test/fixtures/transcripts/copilot-tdd-no-test-run.jsonl',
  cycleCompleted: 'test/fixtures/transcripts/copilot-tdd-cycle-completed.jsonl',
}

const SESSION_ID = 'integration-copilot'

type ScenarioInput = {
  content: string
  transcript: string
  filename?: string
  seed?: string
}

type ScenarioResult = { decision: string; reason?: string }

const it = baseTest
  .extend('preflight', { scope: 'file' }, probeAuth)
  .extend('authGuard', { auto: true }, ({ preflight, skip }) => {
    skipIfUnauthed(preflight, skip)
  })
  .extend('sandbox', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('copilotHome', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('copilotEnv', { auto: true }, ({ copilotHome }, { onCleanup }) => {
    bindCopilotHome(copilotHome, onCleanup)
  })
  .extend(
    'runScenario',
    ({ sandbox, copilotHome }) =>
      (input: ScenarioInput) =>
        runScenario({ sandbox, copilotHome, ...input }),
  )

describe('enforce-tdd + github-copilot', () => {
  it('allows a minimal add implementation after a failing test was run', async ({
    runScenario,
  }) => {
    const result = await runScenario({
      content: MINIMAL_IMPL,
      transcript: T.clean,
    })
    expect(result.decision, result.reason).toBe('allow')
  })

  it('blocks an over-implementation that adds many unrequested functions', async ({
    runScenario,
  }) => {
    const result = await runScenario({
      content: OVER_IMPL,
      transcript: T.clean,
    })
    expect(result.decision, result.reason).toBe('deny')
  })

  it('blocks when the failing test has not been run', async ({
    runScenario,
  }) => {
    const result = await runScenario({
      content: MINIMAL_IMPL,
      transcript: T.noTestRun,
    })
    expect(result.decision, result.reason).toBe('deny')
  })

  it('allows adding a second test to an existing test file', async ({
    runScenario,
  }) => {
    const result = await runScenario({
      filename: 'target.test.ts',
      seed: EXISTING_TEST_CONTENT,
      content: PLUS_ONE_TEST,
      transcript: T.cycleCompleted,
    })
    expect(result.decision, result.reason).toBe('allow')
  })

  it('blocks when two new tests are added in a single write', async ({
    runScenario,
  }) => {
    const result = await runScenario({
      filename: 'target.test.ts',
      seed: EXISTING_TEST_CONTENT,
      content: PLUS_TWO_TESTS,
      transcript: T.cycleCompleted,
    })
    expect(result.decision, result.reason).toBe('deny')
  })
}, 60_000)

async function probeAuth() {
  return preflightAuth(githubCopilot())
}

function bindCopilotHome(
  copilotHome: string,
  onCleanup: (fn: () => Promise<void> | void) => void,
): void {
  const previous = process.env.COPILOT_HOME
  process.env.COPILOT_HOME = copilotHome
  onCleanup(() => {
    if (previous === undefined) delete process.env.COPILOT_HOME
    else process.env.COPILOT_HOME = previous
  })
}

async function runScenario(
  input: ScenarioInput & { sandbox: string; copilotHome: string },
): Promise<ScenarioResult> {
  const filePath = join(input.sandbox, input.filename ?? 'target.ts')
  if (input.seed !== undefined) await writeFile(filePath, input.seed)
  await seedCopilotSession(input.copilotHome, input.transcript)
  const payload = JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    cwd: '/workspaces/probity',
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: filePath,
      file_text: input.content,
    }),
  })
  const { response } = await run(payload, {
    vendor: 'github-copilot',
    loadConfig: () =>
      Promise.resolve({ rules: [enforceTdd({ fastPath: false })] }),
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

async function seedCopilotSession(
  copilotHome: string,
  transcript: string,
): Promise<void> {
  const sessionDir = join(copilotHome, 'session-state', SESSION_ID)
  await mkdir(sessionDir, { recursive: true })
  const events = await readFile(transcript, 'utf8')
  await writeFile(join(sessionDir, 'events.jsonl'), events)
}
