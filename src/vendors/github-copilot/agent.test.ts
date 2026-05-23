import { describe, it, expect } from 'vitest'

import { githubCopilot } from './agent.js'

describe('githubCopilot', () => {
  it('returns the verdict parsed from the assistant message content', async () => {
    const client = githubCopilot({
      client: fakeClient({
        content: '{"kind":"violation","reason":"no test"}',
      }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toMatchObject({ kind: 'violation', reason: 'no test' })
  })

  it('parses a distinct verdict from a different assistant response', async () => {
    const client = githubCopilot({
      client: fakeClient({ content: '{"kind":"pass","reason":"looks fine"}' }),
    })

    const verdict = await client.reason('some prompt')

    expect(verdict).toMatchObject({ kind: 'pass', reason: 'looks fine' })
  })

  it('forwards the rule prompt verbatim to session.sendAndWait', async () => {
    const capture = captureCopilotClient()
    const client = githubCopilot({ client: capture.client })

    await client.reason('rule prompt text')

    expect(capture.lastSendAndWaitOptions?.prompt).toBe('rule prompt text')
  })

  it('creates the session with availableTools: [] so the validator cannot act', async () => {
    const capture = captureCopilotClient()
    const client = githubCopilot({ client: capture.client })

    await client.reason('prompt')

    expect(capture.lastSessionConfig?.availableTools).toEqual([])
  })

  it('calls client.start() before creating the session', async () => {
    const capture = captureCopilotClient()
    const client = githubCopilot({ client: capture.client })

    await client.reason('prompt')

    expect(capture.startCalled).toBe(true)
  })

  it('calls client.stop() to release the spawned CLI subprocess', async () => {
    const capture = captureCopilotClient()
    const client = githubCopilot({ client: capture.client })

    await client.reason('prompt')

    expect(capture.stopCalled).toBe(true)
  })

  it('forwards the onPermissionRequest handler from deps into createSession', async () => {
    const capture = captureCopilotClient()
    const handler = () => ({ kind: 'allow' as const })
    const client = githubCopilot({
      client: capture.client,
      onPermissionRequest: handler,
    })

    await client.reason('prompt')

    expect(capture.lastSessionConfig?.onPermissionRequest).toBe(handler)
  })

  it('returns a fail-closed violation when sendAndWait returns undefined', async () => {
    const client = githubCopilot({
      client: fakeClient({ sendAndWait: () => Promise.resolve(undefined) }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/no response from copilot/i)
  })

  it('returns a fail-closed violation when the SDK call throws', async () => {
    const client = githubCopilot({
      client: fakeClient({
        sendAndWait: () =>
          Promise.reject(new Error('copilot CLI not authenticated')),
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toMatch(/copilot CLI not authenticated/)
  })

  it('attaches outputTokens from the assistant message to the verdict', async () => {
    const client = githubCopilot({
      client: fakeClient({
        sendAndWait: () =>
          Promise.resolve({
            data: {
              content: '{"kind":"pass","reason":"ok"}',
              outputTokens: 64,
            },
          }),
      }),
    })

    const verdict = await client.reason('prompt')

    expect(verdict.meta).toEqual({ outputTokens: 64 })
  })
})

type SessionConfig = {
  availableTools?: string[]
  onPermissionRequest?: unknown
}

function captureCopilotClient() {
  const state: {
    lastSendAndWaitOptions?: { prompt: string }
    lastSessionConfig?: SessionConfig
    startCalled: boolean
    stopCalled: boolean
  } = { startCalled: false, stopCalled: false }
  const client = {
    start: () => {
      state.startCalled = true
      return Promise.resolve()
    },
    createSession: (config: SessionConfig) => {
      state.lastSessionConfig = config
      return Promise.resolve({
        sendAndWait: (options: { prompt: string }) => {
          state.lastSendAndWaitOptions = options
          return Promise.resolve({
            data: { content: '{"kind":"pass","reason":""}' },
          })
        },
      })
    },
    stop: () => {
      state.stopCalled = true
      return Promise.resolve([])
    },
  }
  return {
    client,
    get lastSendAndWaitOptions() {
      return state.lastSendAndWaitOptions
    },
    get lastSessionConfig() {
      return state.lastSessionConfig
    },
    get startCalled() {
      return state.startCalled
    },
    get stopCalled() {
      return state.stopCalled
    },
  }
}

function fakeClient(
  opts: {
    sendAndWait?: () => Promise<
      { data: { content: string; outputTokens?: number } } | undefined
    >
    content?: string
  } = {},
) {
  return {
    start: () => Promise.resolve(),
    createSession: () =>
      Promise.resolve({
        sendAndWait:
          opts.sendAndWait ??
          (() =>
            Promise.resolve({
              data: { content: opts.content ?? '{"kind":"pass","reason":""}' },
            })),
      }),
    stop: () => Promise.resolve([]),
  }
}
