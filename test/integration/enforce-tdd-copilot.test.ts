import { mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PreToolUseHookOutput } from '@github/copilot/sdk'
import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { enforceTdd } from '../../src/rules/enforce-tdd.js'
import { parseAs } from '../../src/utils/parse-as.js'
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
const SESSION_ID = 'integration-copilot'

describe.skipIf(!runAi)('enforce-tdd + github-copilot (integration)', () => {
  it(
    'allows a minimal add implementation after a failing test was run',
    async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-clean.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'allow')
    },
    AI_TIMEOUT,
  )

  it(
    'blocks an over-implementation that adds many unrequested functions',
    async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-clean.jsonl',
        pendingContent: OVER_IMPL,
      })

      expectDecision(result, 'deny')
    },
    AI_TIMEOUT,
  )

  it(
    'blocks implementation when the failing test has not been run',
    async () => {
      const result = await runScenario({
        transcript: 'test/fixtures/transcripts/copilot-tdd-no-test-run.jsonl',
        pendingContent: MINIMAL_IMPL,
      })

      expectDecision(result, 'deny')
    },
    AI_TIMEOUT,
  )

  it(
    'allows adding a second test to an existing test file',
    async () => {
      const result = await runScenario({
        transcript:
          'test/fixtures/transcripts/copilot-tdd-cycle-completed.jsonl',
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
          'test/fixtures/transcripts/copilot-tdd-cycle-completed.jsonl',
        beforeFile: EXISTING_TEST_CONTENT,
        pendingContent: PLUS_TWO_TESTS,
      })

      expectDecision(result, 'deny')
    },
    AI_TIMEOUT,
  )
})

async function runScenario(opts: {
  transcript: string
  pendingContent: string
  beforeFile?: string
}): Promise<{ decision: string; reason?: string }> {
  const home = await mkdtemp(path.join(tmpdir(), 'probity-copilot-tdd-'))
  const sessionDir = path.join(home, 'session-state', SESSION_ID)
  await mkdir(sessionDir, { recursive: true })
  await cp(opts.transcript, path.join(sessionDir, 'events.jsonl'))

  const prevHome = process.env.COPILOT_HOME
  process.env.COPILOT_HOME = home
  const fileDir = await mkdtemp(path.join(tmpdir(), 'probity-copilot-file-'))
  onTestFinished(async () => {
    if (prevHome === undefined) delete process.env.COPILOT_HOME
    else process.env.COPILOT_HOME = prevHome
    await rm(home, { recursive: true, force: true })
    await rm(fileDir, { recursive: true, force: true })
  })

  const filePath = path.join(fileDir, targetFilename(opts.pendingContent))
  if (opts.beforeFile !== undefined) {
    await writeFile(filePath, opts.beforeFile)
  }
  const payload = JSON.stringify({
    sessionId: SESSION_ID,
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
