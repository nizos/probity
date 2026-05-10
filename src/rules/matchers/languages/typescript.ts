import { Lang } from '@ast-grep/napi'

const TEST_NAME_REGEX = '^(it|test|xit|fit|xtest|ftest)$'

const ID_RULE = { kind: 'identifier', regex: TEST_NAME_REGEX }
const M1 = {
  kind: 'member_expression',
  has: { field: 'object', ...ID_RULE },
}
const M2 = {
  kind: 'member_expression',
  has: { field: 'object', any: [ID_RULE, M1] },
}
const M3 = {
  kind: 'member_expression',
  has: { field: 'object', any: [ID_RULE, M1, M2] },
}

export const typescript = {
  name: 'typescript',
  extensions: ['.ts', '.tsx'],
  parser: Lang.TypeScript,
  patterns: [
    {
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          any: [ID_RULE, M1, M2, M3],
        },
      },
    },
  ],
}
