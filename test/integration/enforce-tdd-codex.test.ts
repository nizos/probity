import { describe, it } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
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

describe.skipIf(!runAi)(
  'enforce-tdd + codex',
  () => {
    it('allows clean TDD with minimal implementation', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/codex-tdd-test-failed.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'allow')
    })

    it('blocks clear over-implementation', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/codex-tdd-test-failed.jsonl',
        pendingContent: OVER_IMPL,
      })

      expectDecision(result, 'block')
    })

    it('blocks implementation when the failing test has not been run', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/codex-tdd-no-test-run.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'block')
    })

    it('allows adding a second test to an existing test file', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/codex-tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_ONE_TEST,
      })

      expectDecision(result, 'allow')
    })

    it('blocks when two new tests are added in a single write', async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/codex-tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_TWO_TESTS,
      })

      expectDecision(result, 'block')
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
      vendor: 'codex',
      loadConfig: () =>
        Promise.resolve({ rules: [enforceTdd({ fastPath: false })] }),
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
    session_id: 'integration-codex',
    turn_id: 'integration-codex-turn',
    transcript_path: opts.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.5',
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: { command: buildAddFilePatch(opts.filePath, opts.content) },
    tool_use_id: 'call_integration_codex',
  })
}

function buildAddFilePatch(filePath: string, content: string): string {
  const body = content
    .split('\n')
    .map((line) => `+${line}`)
    .join('\n')
  return `*** Begin Patch\n*** Add File: ${filePath}\n${body}\n*** End Patch\n`
}

function extractResult(response: string): {
  decision: string
  reason?: string
} {
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<CodexResponse>(response)
  return {
    decision: parsed.decision ?? 'allow',
    ...(parsed.reason !== undefined && { reason: parsed.reason }),
  }
}
