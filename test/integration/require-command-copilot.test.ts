import { describe, it, onTestFinished } from 'vitest'

import { run } from '../../src/cli.js'
import { requireCommand } from '../../src/rules/require-command.js'
import { decodeResponse } from './helpers/decode-response.js'
import { expectDecision } from './helpers/expect-decision.js'
import { createSandbox } from './helpers/sandbox.js'

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

describe('require-command + github-copilot', () => {
  it('denies a `git commit` when an `edit` action happened between the required `npm run lint` and the commit', async () => {
    const homeSandbox = await createSandbox({
      [`session-state/${SESSION_ID}/events.jsonl`]: TRANSCRIPT_EDIT_AFTER_LINT,
    })
    useCopilotHome(homeSandbox.path)

    const { response } = await run(
      buildBashPayload({ command: 'git commit -m "wip"' }),
      {
        vendor: 'github-copilot',
        loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
      },
    )

    expectDecision(decodeResponse('github-copilot', response), 'deny')
  })

  it('allows a `git commit` when the required `npm run lint` was the most recent event and no edit followed', async () => {
    const homeSandbox = await createSandbox({
      [`session-state/${SESSION_ID}/events.jsonl`]: TRANSCRIPT_LINT_ONLY,
    })
    useCopilotHome(homeSandbox.path)

    const { response } = await run(
      buildBashPayload({ command: 'git commit -m "wip"' }),
      {
        vendor: 'github-copilot',
        loadConfig: () => Promise.resolve({ rules: [LINT_BEFORE_COMMIT] }),
      },
    )

    expectDecision(decodeResponse('github-copilot', response), 'allow')
  })
})

function useCopilotHome(value: string): void {
  const previous = process.env.COPILOT_HOME
  process.env.COPILOT_HOME = value
  onTestFinished(() => {
    if (previous === undefined) delete process.env.COPILOT_HOME
    else process.env.COPILOT_HOME = previous
  })
}

function buildBashPayload(opts: { command: string }): string {
  return JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    cwd: '/workspaces/probity',
    toolName: 'bash',
    toolArgs: JSON.stringify({ command: opts.command }),
  })
}
