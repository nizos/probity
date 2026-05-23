import type { ThreadOptions } from '@openai/codex-sdk'
import { describe, it, expect } from 'vitest'

import { codex } from './agent.js'

describe('codex', () => {
  it('returns the verdict parsed from the thread final response', async () => {
    const client = codex({
      codex: fakeCodex({
        finalResponse: '{"kind":"violation","reason":"no test"}',
      }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toMatchObject({ kind: 'violation', reason: 'no test' })
  })

  it('parses a distinct verdict from a different thread response', async () => {
    const client = codex({
      codex: fakeCodex({
        finalResponse: '{"kind":"pass","reason":"looks fine"}',
      }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toMatchObject({ kind: 'pass', reason: 'looks fine' })
  })

  it('starts the thread with skipGitRepoCheck so the validator runs anywhere', async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('prompt')

    expect(capture.lastThreadOptions?.skipGitRepoCheck).toBe(true)
  })

  it('uses read-only sandboxMode so the validator cannot write or run commands', async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('prompt')

    expect(capture.lastThreadOptions?.sandboxMode).toBe('read-only')
  })

  it("uses approvalPolicy 'never' so the validator cannot escalate", async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('prompt')

    expect(capture.lastThreadOptions?.approvalPolicy).toBe('never')
  })

  it('disables network access so the validator cannot reach out', async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('prompt')

    expect(capture.lastThreadOptions?.networkAccessEnabled).toBe(false)
  })

  it('disables web search so the validator stays self-contained', async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('prompt')

    expect(capture.lastThreadOptions?.webSearchEnabled).toBe(false)
  })

  it('forwards the rule prompt verbatim to thread.run', async () => {
    const capture = captureCodex()
    const client = codex({ codex: capture.codex })

    await client.reason('rule prompt text')

    expect(capture.lastRunInput).toBe('rule prompt text')
  })

  it('returns a fail-closed violation when the SDK run throws', async () => {
    const client = codex({
      codex: fakeCodex({
        run: () => Promise.reject(new Error('codex CLI not found')),
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/codex CLI not found/)
  })

  it('attaches input/output token counts from the Codex turn to the verdict', async () => {
    const client = codex({
      codex: fakeCodex({
        run: () =>
          Promise.resolve({
            finalResponse: '{"kind":"pass","reason":"ok"}',
            usage: { input_tokens: 200, output_tokens: 40 },
          }),
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.meta).toEqual({ inputTokens: 200, outputTokens: 40 })
  })
})

function captureCodex() {
  const state: {
    lastThreadOptions?: ThreadOptions | undefined
    lastRunInput?: string | undefined
  } = {}
  const codex = {
    startThread(opts?: ThreadOptions) {
      state.lastThreadOptions = opts
      return {
        run: (input?: string) => {
          state.lastRunInput = input
          return Promise.resolve({
            finalResponse: '{"kind":"pass","reason":""}',
          })
        },
      }
    },
  }
  return {
    codex,
    get lastThreadOptions() {
      return state.lastThreadOptions
    },
    get lastRunInput() {
      return state.lastRunInput
    },
  }
}

function fakeCodex(
  opts: {
    run?: () => Promise<{
      finalResponse: string
      usage?: { input_tokens?: number; output_tokens?: number } | null
    }>
    finalResponse?: string
  } = {},
) {
  return {
    startThread() {
      return {
        run:
          opts.run ??
          (() =>
            Promise.resolve({
              finalResponse:
                opts.finalResponse ?? '{"kind":"pass","reason":""}',
            })),
      }
    },
  }
}
