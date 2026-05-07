import { isRegistered } from './register.js'

export const ruby = {
  name: 'ruby',
  extensions: ['.rb'],
  parser: isRegistered('ruby') ? 'ruby' : undefined,
  patterns: [
    {
      rule: {
        kind: 'call',
        has: { field: 'method', regex: '^(it|specify|xit|fit)$' },
      },
    },
    {
      rule: {
        kind: 'method',
        has: { field: 'name', regex: '^test_' },
      },
    },
  ],
} as const
