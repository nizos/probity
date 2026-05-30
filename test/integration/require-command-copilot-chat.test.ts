import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

import { describe, expect, test as baseTest } from 'vitest'

import { run } from '../../src/cli.js'
import { requireCommand } from '../../src/rules/require-command.js'
import {
  decodeResponse,
  type DecodedResponse,
} from './helpers/decode-response.js'
import { makeSandboxDir } from './helpers/sandbox.js'

const TRANSCRIPT_FILENAME = 'transcript.jsonl'

const TRANSCRIPT_EDIT_AFTER_LINT = [
  '{"type":"user.message","data":{"content":"run lint then commit"}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_lint","toolName":"run_in_terminal","arguments":{"command":"npm run lint"}}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_edit","toolName":"replace_string_in_file","arguments":{"filePath":"/workspaces/probity/src/calc.ts","oldString":"a","newString":"b"}}}',
  '',
].join('\n')

const TRANSCRIPT_LINT_ONLY = [
  '{"type":"user.message","data":{"content":"run lint then commit"}}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_lint","toolName":"run_in_terminal","arguments":{"command":"npm run lint"}}}',
  '',
].join('\n')

const LINT_BEFORE_COMMIT = requireCommand({
  before: { kind: 'command', match: /git commit/ },
  command: /npm run lint/,
  after: { kind: 'write' },
})

const it = baseTest
  .extend('sandbox', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('transcript', TRANSCRIPT_EDIT_AFTER_LINT)
  .extend(
    'result',
    async ({ sandbox, transcript }: { sandbox: string; transcript: string }) =>
      runScenario(sandbox, transcript),
  )

describe('require-command + github-copilot-chat', () => {
  describe('a replace_string_in_file happened between the required lint and the commit', () => {
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

async function runScenario(
  sandbox: string,
  transcript: string,
): Promise<DecodedResponse> {
  const transcriptPath = join(sandbox, TRANSCRIPT_FILENAME)
  await writeFile(transcriptPath, transcript)
  const { response } = await run(
    buildBashPayload('git commit -m "wip"', transcriptPath),
    {
      vendor: 'github-copilot-chat',
      loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
    },
  )
  return decodeResponse('github-copilot-chat', response)
}

function buildBashPayload(command: string, transcriptPath: string): string {
  return JSON.stringify({
    transcript_path: transcriptPath,
    cwd: '/workspaces/probity',
    tool_name: 'run_in_terminal',
    tool_input: { command },
  })
}
