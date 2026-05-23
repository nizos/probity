import { describe, expect, it } from 'vitest'

import { enforceFilenameCasing } from './enforce-filename-casing.js'
import { enforceTdd } from './enforce-tdd.js'
import { forbidCommandPattern } from './forbid-command-pattern.js'
import { forbidContentPattern } from './forbid-content-pattern.js'
import { requireCommand } from './require-command.js'

describe('built-in rule factories', () => {
  it.each([
    ['enforceFilenameCasing', enforceFilenameCasing({ style: 'kebab-case' })],
    ['enforceTdd', enforceTdd()],
    [
      'forbidCommandPattern',
      forbidCommandPattern({ match: /never-matches/, reason: 'x' }),
    ],
    [
      'forbidContentPattern',
      forbidContentPattern({ match: /never-matches/, reason: 'x' }),
    ],
    [
      'requireCommand',
      requireCommand({
        before: { kind: 'command', match: /git commit/ },
        command: /lint/,
      }),
    ],
  ])(
    '%s produces a rule whose .name is the factory name (for trace attribution)',
    (name, rule) => {
      expect(rule.name).toBe(name)
    },
  )
})
