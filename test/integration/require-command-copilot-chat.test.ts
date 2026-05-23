import { describe, it } from 'vitest'

import { run } from '../../src/cli.js'
import { requireCommand } from '../../src/rules/require-command.js'
import { decodeResponse } from './helpers/decode-response.js'
import { expectDecision } from './helpers/expect-decision.js'
import { createSandbox } from './helpers/sandbox.js'

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

describe('require-command + github-copilot-chat', () => {
  it('denies a `git commit` when a `replace_string_in_file` action happened between the required `npm run lint` and the commit', async () => {
    const sandbox = await createSandbox({
      [TRANSCRIPT_FILENAME]: TRANSCRIPT_EDIT_AFTER_LINT,
    })

    const { response } = await run(
      buildBashPayload({
        command: 'git commit -m "wip"',
        transcriptPath: sandbox.getPath(TRANSCRIPT_FILENAME),
      }),
      {
        vendor: 'github-copilot-chat',
        loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
      },
    )

    expectDecision(decodeResponse('github-copilot-chat', response), 'deny')
  })

  it('allows a `git commit` when the required `npm run lint` was the most recent event and no edit followed', async () => {
    const sandbox = await createSandbox({
      [TRANSCRIPT_FILENAME]: TRANSCRIPT_LINT_ONLY,
    })

    const { response } = await run(
      buildBashPayload({
        command: 'git commit -m "wip"',
        transcriptPath: sandbox.getPath(TRANSCRIPT_FILENAME),
      }),
      {
        vendor: 'github-copilot-chat',
        loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
      },
    )

    expectDecision(decodeResponse('github-copilot-chat', response), 'allow')
  })
})

function buildBashPayload(opts: {
  command: string
  transcriptPath: string
}): string {
  return JSON.stringify({
    transcript_path: opts.transcriptPath,
    cwd: '/workspaces/probity',
    tool_name: 'run_in_terminal',
    tool_input: { command: opts.command },
  })
}
