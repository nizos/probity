import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
import { expectDecision } from './helpers/expect-decision.js'
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
  'enforce-tdd + codex (integration with real AI)',
  () => {
    it(
      'allows clean TDD with minimal implementation',
      async () => {
        const result = await runScenario({
          transcript: 'test/fixtures/transcripts/codex-tdd-test-failed.jsonl',
          pendingContent: MINIMAL_IMPL,
        })

        expectDecision(result, 'allow')
      },
      AI_TIMEOUT,
    )

    it(
      'blocks clear over-implementation',
      async () => {
        const result = await runScenario({
          transcript: 'test/fixtures/transcripts/codex-tdd-test-failed.jsonl',
          pendingContent: OVER_IMPL,
        })

        expectDecision(result, 'block')
      },
      AI_TIMEOUT,
    )

    it(
      'blocks implementation when the failing test has not been run',
      async () => {
        const result = await runScenario({
          transcript: 'test/fixtures/transcripts/codex-tdd-no-test-run.jsonl',
          pendingContent: MINIMAL_IMPL,
        })

        expectDecision(result, 'block')
      },
      AI_TIMEOUT,
    )

    it(
      'allows adding a second test to an existing test file',
      async () => {
        const result = await runScenario({
          transcript:
            'test/fixtures/transcripts/codex-tdd-cycle-completed.jsonl',
          beforeFile: EXISTING_TEST_CONTENT,
          pendingContent: PLUS_ONE_TEST,
        })

        expectDecision(result, 'allow')
      },
      AI_TIMEOUT,
    )

    it(
      'blocks when two new tests are added in a single write',
      async () => {
        const result = await runScenario({
          transcript:
            'test/fixtures/transcripts/codex-tdd-cycle-completed.jsonl',
          beforeFile: EXISTING_TEST_CONTENT,
          pendingContent: PLUS_TWO_TESTS,
        })

        expectDecision(result, 'block')
      },
      AI_TIMEOUT,
    )
  },
)

async function runScenario(opts: {
  transcript: string
  pendingContent: string
  beforeFile?: string
}): Promise<{ decision: string; reason?: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'enforce-tdd-codex-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, targetFilename(opts.pendingContent))
  if (opts.beforeFile !== undefined) {
    await writeFile(filePath, opts.beforeFile)
  }
  const payload = JSON.stringify({
    session_id: 'integration-codex',
    turn_id: 'integration-codex-turn',
    transcript_path: opts.transcript,
    cwd: '/workspaces/probity',
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.5',
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: { command: makeAddFilePatch(filePath, opts.pendingContent) },
    tool_use_id: 'call_integration_codex',
  })
  const response = await run(payload, {
    vendor: 'codex',
    loadConfig: () => Promise.resolve({ rules: [enforceTdd()] }),
  })
  if (response === '') return { decision: 'allow' }
  const parsed = parseAs<CodexResponse>(response)
  return {
    decision: parsed.decision ?? 'allow',
    ...(parsed.reason !== undefined && { reason: parsed.reason }),
  }
}

function makeAddFilePatch(filePath: string, content: string): string {
  const body = content
    .split('\n')
    .map((line) => `+${line}`)
    .join('\n')
  return `*** Begin Patch\n*** Add File: ${filePath}\n${body}\n*** End Patch\n`
}
