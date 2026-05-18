import { isRegistered } from './register.js'

export const php = {
  name: 'php',
  extensions: ['.php'],
  parser: isRegistered('php') ? 'php' : undefined,
  patterns: [
    {
      rule: {
        kind: 'method_declaration',
        any: [
          { has: { field: 'name', regex: '^test' } },
          {
            has: {
              stopBy: 'end' as const,
              kind: 'attribute',
              regex: '^Test(\\(|$)',
            },
          },
          { follows: { kind: 'comment', regex: '@test\\b' } },
        ],
      },
    },
  ],
}
