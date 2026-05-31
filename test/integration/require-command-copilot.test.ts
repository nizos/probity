import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { run } from '../../src/cli.js'
import { requireCommand } from '../../src/rules/require-command.js'
import {
  decodeResponse,
  type DecodedResponse,
} from '../helpers/decode-response.js'
import { makeSandboxDir } from '../helpers/sandbox.js'

const SESSION_ID = 'integration-require-command-copilot'

const TRANSCRIPT_EDIT_AFTER_LINT = [
  '{"type":"user.message","data":{"content":"run lint then commit"}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_lint","toolName":"bash","arguments":{"command":"npm run lint"}}}',
  '{"type":"tool.execution_complete","data":{"toolCallId":"call_lint","success":true,"result":{"content":"All files passed lint"}}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_edit","toolName":"edit","arguments":{"path":"/workspaces/probity/src/calc.ts","old_str":"a","new_str":"b"}}}',
  '{"type":"tool.execution_complete","data":{"toolCallId":"call_edit","success":true,"result":{"content":"File updated"}}}',
  '',
].join('\n')

const TRANSCRIPT_LINT_ONLY = [
  '{"type":"user.message","data":{"content":"run lint then commit"}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_lint","toolName":"bash","arguments":{"command":"npm run lint"}}}',
  '{"type":"tool.execution_complete","data":{"toolCallId":"call_lint","success":true,"result":{"content":"All files passed lint"}}}',
  '',
].join('\n')

const LINT_BEFORE_COMMIT = requireCommand({
  before: { kind: 'command', match: /git commit/ },
  command: /npm run lint/,
  after: { kind: 'write' },
})

const it = baseTest
  .extend('sandbox', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('copilotEnv', { auto: true }, ({ sandbox }, { onCleanup }) => {
    bindCopilotHome(sandbox, onCleanup)
  })
  .extend('transcript', TRANSCRIPT_EDIT_AFTER_LINT)
  .extend(
    'result',
    async ({ sandbox, transcript }: { sandbox: string; transcript: string }) =>
      runScenario(sandbox, transcript),
  )

describe('require-command + github-copilot', () => {
  describe('an edit happened between the required lint and the commit', () => {
    it.override('transcript', TRANSCRIPT_EDIT_AFTER_LINT)

    it('denies the commit', ({ result }) => {
      expect(result.decision, result.reason).toBe('deny')
    })
  })

  describe('lint was the most recent event and no edit followed', () => {
    it.override('transcript', TRANSCRIPT_LINT_ONLY)

    it('allows the commit', ({ result }) => {
      expect(result.decision, result.reason).toBe('allow')
    })
  })
})

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
  copilotHome: string,
  transcript: string,
): Promise<DecodedResponse> {
  const sessionDir = join(copilotHome, 'session-state', SESSION_ID)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'events.jsonl'), transcript)
  const { response } = await run(buildBashPayload('git commit -m "wip"'), {
    vendor: 'github-copilot',
    loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
  })
  return decodeResponse('github-copilot', response)
}

function buildBashPayload(command: string): string {
  return JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    cwd: '/workspaces/probity',
    toolName: 'bash',
    toolArgs: JSON.stringify({ command }),
  })
}
