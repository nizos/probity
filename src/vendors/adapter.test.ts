import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import type { Action } from '../types.js'
import { fromSchema, passthroughFor } from './adapter.js'

describe('fromSchema', () => {
  it('wraps a Zod schema into a parseAction returning {ok: true, actions: [action]} for valid input', async () => {
    const schema = z
      .object({ kind: z.literal('command'), command: z.string() })
      .transform((d): Action => ({ kind: 'command', command: d.command }))

    const parse = fromSchema(schema)

    expect(await parse({ kind: 'command', command: 'echo hi' })).toEqual({
      ok: true,
      actions: [{ kind: 'command', command: 'echo hi' }],
    })
  })

  it('normalizes a schema that yields multiple actions into the actions array', async () => {
    const schema = z
      .object({ kind: z.literal('multi') })
      .transform((): Action[] => [
        { kind: 'command', command: 'a' },
        { kind: 'command', command: 'b' },
      ])

    const parse = fromSchema(schema)

    expect(await parse({ kind: 'multi' })).toEqual({
      ok: true,
      actions: [
        { kind: 'command', command: 'a' },
        { kind: 'command', command: 'b' },
      ],
    })
  })

  it('returns {ok: false, reason} formed from the joined Zod issue messages on invalid input', async () => {
    const schema = z
      .object({ kind: z.literal('command'), command: z.string() })
      .transform((d): Action => ({ kind: 'command', command: d.command }))

    const parse = fromSchema(schema)
    const result = await parse({ kind: 'wrong' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toMatch(/literal|kind|command/i)
  })
})

describe('passthroughFor', () => {
  it('produces a schema that accepts an unknown tool name and yields a no-op command action', () => {
    const schema = passthroughFor('tool_name', ['Bash', 'Edit', 'Write'])

    const action = schema.parse({ tool_name: 'MultiEdit' })

    expect(action).toEqual({ kind: 'command', command: '' })
  })
})
