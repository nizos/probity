import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { objectOrJsonString } from './object-or-json-string.js'

describe('objectOrJsonString', () => {
  it('decodes the JSON-encoded string form', () => {
    const schema = objectOrJsonString(z.object({ command: z.string() }))

    expect(schema.parse('{"command":"npm test"}')).toEqual({
      command: 'npm test',
    })
  })
})
