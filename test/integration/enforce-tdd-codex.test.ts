import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test as baseTest, type TestContext } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
import { codex } from '../../src/vendors/codex/agent.js'
import {
  preflightAuth,
  type PreflightResult,
} from './helpers/preflight-auth.js'
import {
  EXISTING_TEST_CONTENT,
  MINIMAL_IMPL,
  OVER_IMPL,
  PLUS_ONE_TEST,
  PLUS_TWO_TESTS,
} from './helpers/tdd-fixtures.js'

const T = {
  testFailed: 'test/fixtures/transcripts/codex-tdd-test-failed.jsonl',
  noTestRun: 'test/fixtures/transcripts/codex-tdd-no-test-run.jsonl',
  cycleCompleted: 'test/fixtures/transcripts/codex-tdd-cycle-completed.jsonl',
}

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
  .extend('sandbox', async ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend(
    'runScenario',
    ({ sandbox }) =>
      (input: ScenarioInput) =>
        runScenario({ sandbox, ...input }),
  )

describe.concurrent(
  'enforce-tdd + codex',
  () => {
    it('allows clean TDD with minimal implementation', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        content: MINIMAL_IMPL,
        transcript: T.testFailed,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('blocks clear over-implementation', async ({ runScenario }) => {
      const result = await runScenario({
        content: OVER_IMPL,
        transcript: T.testFailed,
      })
      expect(result.decision, result.reason).toBe('block')
    })

    it('blocks when the failing test has not been run', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        content: MINIMAL_IMPL,
        transcript: T.noTestRun,
      })
      expect(result.decision, result.reason).toBe('block')
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
      expect(result.decision, result.reason).toBe('block')
    })
  },
  60_000,
)

async function probeAuth() {
  return preflightAuth(codex())
}

function skipIfUnauthed(preflight: PreflightResult, skip: TestContext['skip']) {
  if (!preflight.ok) skip(true, preflight.reason)
}

async function makeSandboxDir(
  onCleanup: (fn: () => Promise<void> | void) => void,
) {
  const dir = await mkdtemp(join(tmpdir(), 'probity-'))
  onCleanup(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function runScenario(
  input: ScenarioInput & { sandbox: string },
): Promise<ScenarioResult> {
  const filePath = join(input.sandbox, input.filename ?? 'target.ts')
  if (input.seed !== undefined) await writeFile(filePath, input.seed)
  const payload = JSON.stringify({
    session_id: 'integration-codex',
    turn_id: 'integration-codex-turn',
    transcript_path: input.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.5',
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: { command: buildAddFilePatch(filePath, input.content) },
    tool_use_id: 'call_integration_codex',
  })
  const { response } = await run(payload, {
    vendor: 'codex',
    loadConfig: () =>
      Promise.resolve({ rules: [enforceTdd({ fastPath: false })] }),
  })
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<CodexResponse>(response)
  return {
    decision: parsed.decision ?? 'allow',
    ...(parsed.reason !== undefined && { reason: parsed.reason }),
  }
}

function buildAddFilePatch(filePath: string, content: string): string {
  const body = content
    .split('\n')
    .map((line) => `+${line}`)
    .join('\n')
  return `*** Begin Patch\n*** Add File: ${filePath}\n${body}\n*** End Patch\n`
}
