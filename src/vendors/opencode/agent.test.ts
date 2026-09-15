import { describe, expect, it, vi } from 'vitest'

import { opencode } from './agent.js'

describe('opencode agent', () => {
  it('returns an Agent with a reason method', () => {
    const agent = opencode({ promptFn: vi.fn() })
    expect(typeof agent.reason).toBe('function')
  })

  it('parses a pass verdict from the prompt response', async () => {
    const promptFn = vi.fn().mockResolvedValue({
      text: '{"kind":"pass","reason":"test exists"}',
    })
    const agent = opencode({ promptFn })
    const verdict = await agent.reason('Is there a test?')
    expect(verdict.kind).toBe('pass')
    expect(verdict.reason).toBe('test exists')
    expect(promptFn).toHaveBeenCalledWith('Is there a test?')
  })

  it('parses a violation verdict from the prompt response', async () => {
    const promptFn = vi.fn().mockResolvedValue({
      text: '{"kind":"violation","reason":"no test found"}',
    })
    const agent = opencode({ promptFn })
    const verdict = await agent.reason('Is there a test?')
    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toBe('no test found')
  })

  it('returns a fail-closed violation when the SDK throws', async () => {
    const promptFn = vi.fn().mockRejectedValue(new Error('SDK failure'))
    const agent = opencode({ promptFn })
    const verdict = await agent.reason('test prompt')
    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toBe('SDK failure')
  })

  it('returns a violation for unparseable response text', async () => {
    const promptFn = vi.fn().mockResolvedValue({
      text: 'not valid json',
    })
    const agent = opencode({ promptFn })
    const verdict = await agent.reason('test prompt')
    expect(verdict.kind).toBe('violation')
    expect(verdict.reason).toContain('could not parse verdict')
  })

  it('attaches meta when provided by the response', async () => {
    const promptFn = vi.fn().mockResolvedValue({
      text: '{"kind":"pass","reason":"ok"}',
      meta: { model: 'test-model', inputTokens: 100 },
    })
    const agent = opencode({ promptFn })
    const verdict = await agent.reason('test prompt')
    expect(verdict.kind).toBe('pass')
    expect(verdict.meta).toEqual({ model: 'test-model', inputTokens: 100 })
  })
})
