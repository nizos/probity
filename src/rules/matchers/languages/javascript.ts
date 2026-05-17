import { Lang } from '@ast-grep/napi'

const TEST_NAME_REGEX = '^(it|test|xit|fit|xtest|ftest)$'

const ID_RULE = { kind: 'identifier', regex: TEST_NAME_REGEX }
const MEMBER_DEPTH_1 = {
  kind: 'member_expression',
  has: { field: 'object', ...ID_RULE },
}
const MEMBER_DEPTH_2 = {
  kind: 'member_expression',
  has: { field: 'object', any: [ID_RULE, MEMBER_DEPTH_1] },
}
const MEMBER_DEPTH_3 = {
  kind: 'member_expression',
  has: { field: 'object', any: [ID_RULE, MEMBER_DEPTH_1, MEMBER_DEPTH_2] },
}

// Depth-3 covers `it.concurrent.skip.each(...)`; deeper chains aren't matched.
export const javascript = {
  name: 'javascript',
  extensions: ['.js'],
  parser: Lang.JavaScript,
  patterns: [
    {
      rule: {
        kind: 'call_expression',
        has: {
          field: 'function',
          any: [ID_RULE, MEMBER_DEPTH_1, MEMBER_DEPTH_2, MEMBER_DEPTH_3],
        },
      },
    },
  ],
}
