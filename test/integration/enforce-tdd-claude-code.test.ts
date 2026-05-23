import { describe, it } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import { expectDecision } from './helpers/expect-decision.js'
import { createSandbox } from './helpers/sandbox.js'
import {
  EXISTING_TEST_CONTENT,
  MINIMAL_IMPL,
  MINIMAL_IMPL_PLUS_UNUSED_IMPORT,
  MODULO_STUB_IMPL,
  OVER_IMPL,
  PLUS_ONE_TEST,
  PLUS_TWO_TESTS,
  targetFilename,
} from './helpers/tdd-fixtures.js'

const runAi = process.env.PROBITY_INTEGRATION_AI === '1'
const AI_TIMEOUT = 60_000

describe.skipIf(!runAi)(
  'enforce-tdd + claude-code',
  () => {
    it('allows clean TDD with minimal implementation', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-clean.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'allow')
    })

    it('blocks clear over-implementation', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-over-impl.jsonl',
        pendingContent: OVER_IMPL,
      })

      expectDecision(result, 'deny')
    })

    it('blocks implementation when the failing test has not been run', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-no-test-run.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'deny')
    })

    it('allows adding a second test to an existing test file', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_ONE_TEST,
      })

      expectDecision(result, 'allow')
    })

    it('blocks when two new tests are added in a single write', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_TWO_TESTS,
      })

      expectDecision(result, 'deny')
    })

    it('allows a stub when a recent failing test is buried under noisy follow-up reads', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-noisy-buried-failure.jsonl',
        pendingContent: MODULO_STUB_IMPL,
      })

      expectDecision(result, 'allow')
    })

    it('allows the first write of a multi-step change', async () => {
      // adds an import; the follow-up write will call into it
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/tdd-cycle-completed.jsonl',
        beforeFile: MINIMAL_IMPL,
        pendingContent: MINIMAL_IMPL_PLUS_UNUSED_IMPORT,
      })

      expectDecision(result, 'allow')
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
  const sandbox = await createSandbox(
    opts.beforeFile !== undefined ? { [filename]: opts.beforeFile } : {},
  )
  const filePath = sandbox.getPath(filename)
  const { response } = await run(
    buildPayload({
      transcript: opts.transcript,
      filePath,
      content: opts.pendingContent,
    }),
    {
      vendor: 'claude-code',
      loadConfig: () => Promise.resolve({ rules: [enforceTdd()] }),
    },
  )
  return extractResult(response)
}

function buildPayload(opts: {
  transcript: string
  filePath: string
  content: string
}): string {
  return JSON.stringify({
    session_id: 'integration',
    transcript_path: opts.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: opts.filePath, content: opts.content },
    tool_use_id: 'toolu_integration',
  })
}

function extractResult(response: string): {
  decision: string
  reason?: string
} {
  if (response === '') return { decision: 'allow' }
  const out = parseAs<ClaudeCodeResponse>(response).hookSpecificOutput
  return {
    decision: out.permissionDecision ?? 'allow',
    ...(out.permissionDecisionReason !== undefined && {
      reason: out.permissionDecisionReason,
    }),
  }
}
