// File shapes for the refactor-enforcement "allow" test. recordDeposit and
// recordWithdrawal read as near-duplicates, but the shared part is a thin
// three-call delegating sequence (policy/store), not a substantial block, so
// extracting it is a judgment call the validator defers to the agent on.
// Pairs with the ledger-borderline-refactor transcript.

export const LEDGER_BORDERLINE_TESTS = `import { describe, expect, it } from 'vitest'

import { recordDeposit, recordWithdrawal } from './ledger.js'

describe('ledger', () => {
  it('records a deposit entry', () => {
    expect(recordDeposit('alice', 100)).toEqual({
      account: 'alice',
      amount: 100,
      kind: 'deposit',
    })
  })

  it('records a withdrawal as a negative entry', () => {
    expect(recordWithdrawal('bob', 40)).toEqual({
      account: 'bob',
      amount: -40,
      kind: 'withdrawal',
    })
  })
})
`

export const LEDGER_BORDERLINE_TESTS_WITH_TRANSFER = `import { describe, expect, it } from 'vitest'

import { recordDeposit, recordTransfer, recordWithdrawal } from './ledger.js'

describe('ledger', () => {
  it('records a deposit entry', () => {
    expect(recordDeposit('alice', 100)).toEqual({
      account: 'alice',
      amount: 100,
      kind: 'deposit',
    })
  })

  it('records a withdrawal as a negative entry', () => {
    expect(recordWithdrawal('bob', 40)).toEqual({
      account: 'bob',
      amount: -40,
      kind: 'withdrawal',
    })
  })

  it('records a transfer as paired entries', () => {
    expect(recordTransfer('alice', 'bob', 30)).toEqual([
      { account: 'alice', amount: -30, kind: 'withdrawal' },
      { account: 'bob', amount: 30, kind: 'deposit' },
    ])
  })
})
`
