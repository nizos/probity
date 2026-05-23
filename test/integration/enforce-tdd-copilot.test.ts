import { readFileSync } from 'node:fs'

import type { PreToolUseHookOutput } from '@github/copilot/sdk'
import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import { expectDecision } from './helpers/expect-decision.js'
import { createSandbox } from './helpers/sandbox.js'
import {
  EXISTING_TEST_CONTENT,
  MINIMAL_IMPL,
  OVER_IMPL,
  PLUS_ONE_TEST,
  PLUS_TWO_TESTS,
  targetFilename,
} from './helpers/tdd-fixtures.js'

const runAi = process.env.PROBITY_INTEGRATION_AI === '1'
const AI_TIMEOUT = 60_000
const SESSION_ID = 'integration-copilot'

describe.skipIf(!runAi)(
  'enforce-tdd + github-copilot',
  () => {
    it('allows a minimal add implementation after a failing test was run', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-clean.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'allow')
    })

    it('blocks an over-implementation that adds many unrequested functions', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-clean.jsonl',
        pendingContent: OVER_IMPL,
      })

      expectDecision(result, 'deny')
    })

    it('blocks implementation when the failing test has not been run', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-no-test-run.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'deny')
    })

    it('allows adding a second test to an existing test file', async () => {
      const result = await runScenario({
        transcript:
          'test/fixtures/transcripts/copilot-tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_ONE_TEST,
      })

      expectDecision(result, 'allow')
    })

    it('blocks when two new tests are added in a single write', async () => {
      const result = await runScenario({
        transcript:
          'test/fixtures/transcripts/copilot-tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_TWO_TESTS,
      })

      expectDecision(result, 'deny')
    })
  },
  AI_TIMEOUT,
)

async function runScenario(opts: {
  transcript: string
  pendingContent: string
  beforeFile?: string
}): Promise<{ decision: string; reason?: string }> {
  const filename = targetFilename(opts.pendingContent)
  const homeSandbox = await createSandbox({
    [`session-state/${SESSION_ID}/events.jsonl`]: readFileSync(
      opts.transcript,
      'utf8',
    ),
  })
  useCopilotHome(homeSandbox.path)
  const fileSandbox = await createSandbox(
    opts.beforeFile !== undefined ? { [filename]: opts.beforeFile } : {},
  )
  const filePath = fileSandbox.getPath(filename)
  const { response } = await run(
    buildPayload({ filePath, content: opts.pendingContent }),
    {
      vendor: 'github-copilot',
      loadConfig: () => Promise.resolve({ rules: [enforceTdd()] }),
    },
  )
  return extractResult(response)
}

/**
 * Points `COPILOT_HOME` at `value` for the duration of the current
 * test, restoring whatever was there before (or unsetting if nothing
 * was) when the test finishes.
 */
function useCopilotHome(value: string): void {
  const previous = process.env.COPILOT_HOME
  process.env.COPILOT_HOME = value
  onTestFinished(() => {
    if (previous === undefined) delete process.env.COPILOT_HOME
    else process.env.COPILOT_HOME = previous
  })
}

function buildPayload(opts: { filePath: string; content: string }): string {
  return JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    cwd: '/workspaces/probity',
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: opts.filePath,
      file_text: opts.content,
    }),
  })
}

function extractResult(response: string): {
  decision: string
  reason?: string
} {
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<PreToolUseHookOutput>(response)
  return {
    decision: parsed.permissionDecision ?? 'allow',
    ...(parsed.permissionDecisionReason !== undefined && {
      reason: parsed.permissionDecisionReason,
    }),
  }
}
