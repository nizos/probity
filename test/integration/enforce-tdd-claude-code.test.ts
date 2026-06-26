import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import type { RuleContext } from '../../src/rules/contract.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import { claudeCode } from '../../src/vendors/claude-code/agent.js'
import { readTranscript } from '../../src/vendors/claude-code/transcript.js'
import { preflightAuth, skipIfUnauthed } from '../helpers/preflight-auth.js'
import { makeSandboxDir } from '../helpers/sandbox.js'
import {
  DEAD_HELPER_CALLER_MIGRATED,
  DEAD_HELPER_STILL_CALLED,
  EXISTING_TEST_CONTENT,
  MINIMAL_IMPL,
  MINIMAL_IMPL_PLUS_UNUSED_IMPORT,
  MODULO_STUB_IMPL,
  OVER_IMPL,
  PLUS_ONE_TEST,
  PLUS_TWO_TESTS,
  USED_FN_PRESENT,
  USED_FN_REMOVED,
} from '../helpers/tdd-fixtures.js'
import {
  LEDGER_BORDERLINE_TESTS,
  LEDGER_BORDERLINE_TESTS_WITH_TRANSFER,
  LEDGER_TESTS,
  LEDGER_TESTS_WITH_TRANSFER,
} from '../helpers/ledger-fixtures.js'

const T = {
  clean: 'test/fixtures/transcripts/tdd-clean.jsonl',
  overImpl: 'test/fixtures/transcripts/tdd-over-impl.jsonl',
  noTestRun: 'test/fixtures/transcripts/tdd-no-test-run.jsonl',
  cycleCompleted: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
  noisyBuriedFailure:
    'test/fixtures/transcripts/tdd-noisy-buried-failure.jsonl',
  priorBlock: 'test/fixtures/transcripts/tdd-prior-block-not-in-rules.jsonl',
  removeUsedFn: 'test/fixtures/transcripts/tdd-remove-used-fn.jsonl',
  refactorSkipped: 'test/fixtures/transcripts/ledger-refactor-skipped.jsonl',
  borderlineRefactor:
    'test/fixtures/transcripts/ledger-borderline-refactor.jsonl',
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
  .extend('sandbox', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend(
    'runScenario',
    ({ sandbox }) =>
      (input: ScenarioInput) =>
        runScenario({ sandbox, ...input }),
  )

describe.concurrent(
  'enforce-tdd + claude-code',
  () => {
    it('allows clean TDD with minimal implementation', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        content: MINIMAL_IMPL,
        transcript: T.clean,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('blocks clear over-implementation', async ({ runScenario }) => {
      const result = await runScenario({
        content: OVER_IMPL,
        transcript: T.overImpl,
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

    it('allows a stub when a recent failing test is buried under noisy follow-up reads', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        content: MODULO_STUB_IMPL,
        transcript: T.noisyBuriedFailure,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('allows the first write of a multi-step change', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        seed: MINIMAL_IMPL,
        content: MINIMAL_IMPL_PLUS_UNUSED_IMPORT,
        transcript: T.cycleCompleted,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('does not anchor on an earlier block message that the rules do not support', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        filename: 'target.test.ts',
        seed: DEAD_HELPER_STILL_CALLED,
        content: DEAD_HELPER_CALLER_MIGRATED,
        transcript: T.priorBlock,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('allows removing an in-use function without a failing test', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        filename: 'greet.ts',
        seed: USED_FN_PRESENT,
        content: USED_FN_REMOVED,
        transcript: T.removeUsedFn,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('blocks the next cycle when the prior green left an unmistakable refactor undone', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        filename: 'ledger.test.ts',
        seed: LEDGER_TESTS,
        content: LEDGER_TESTS_WITH_TRANSFER,
        transcript: T.refactorSkipped,
      })
      expect(result.decision, result.reason).toBe('deny')
    })

    it('allows the next cycle when the refactor is a judgment call, not a clear win', async ({
      runScenario,
    }) => {
      const result = await runScenario({
        filename: 'ledger.test.ts',
        seed: LEDGER_BORDERLINE_TESTS,
        content: LEDGER_BORDERLINE_TESTS_WITH_TRANSFER,
        transcript: T.borderlineRefactor,
      })
      expect(result.decision, result.reason).toBe('allow')
    })

    it('returns an empty reason when the validator allows the write', async () => {
      const ctx: RuleContext = {
        agent: claudeCode(),
        rawHistory: () => readTranscript(T.clean),
        readFile: () => Promise.resolve({ kind: 'absent' }),
      }

      const result = await enforceTdd({ fastPath: false })(
        { kind: 'write', path: 'target.ts', content: MINIMAL_IMPL },
        ctx,
      )

      expect(result.kind, JSON.stringify(result)).toBe('pass')
      expect(result.reason).toBe('')
    })
  },
  60_000,
)

async function probeAuth() {
  return preflightAuth(claudeCode())
}

async function runScenario(
  input: ScenarioInput & { sandbox: string },
): Promise<ScenarioResult> {
  const filePath = join(input.sandbox, input.filename ?? 'target.ts')
  if (input.seed !== undefined) await writeFile(filePath, input.seed)
  const payload = JSON.stringify({
    session_id: 'integration',
    transcript_path: input.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: input.content },
    tool_use_id: 'toolu_integration',
  })
  const { response } = await run(payload, {
    vendor: 'claude-code',
    loadConfig: () =>
      Promise.resolve({ rules: [enforceTdd({ fastPath: false })] }),
  })
  if (response === '') return { decision: 'allow' }
  const out = parseAs<ClaudeCodeResponse>(response).hookSpecificOutput
  return {
    decision: out.permissionDecision ?? 'allow',
    ...(out.permissionDecisionReason !== undefined && {
      reason: out.permissionDecisionReason,
    }),
  }
}
