// File shapes for the refactor-enforcement integration tests. They pair
// with the `ledger-*.jsonl` transcripts: each transcript carries the prior
// green, and these constants are the test file the agent is about to write
// when starting the next cycle.

// --- Test 1: a normalize-and-validate block (trim/lowercase plus three
// guards) duplicated verbatim across 2 functions (recordDeposit, recordWithdrawal),
// differing only in the entry's sign and kind. 2 identical copies:
// an unmistakable, self-contained refactor with no downside. ---

// The current test file at green: every record* cycle complete, none deduped.
export const LEDGER_TESTS = `import { describe, expect, it } from 'vitest'

import { recordDeposit, recordWithdrawal } from './ledger.js'

describe('ledger', () => {
  it('normalizes the account and records a deposit entry', () => {
    expect(recordDeposit('  Alice  ', 100)).toEqual({
      account: 'alice',
      amount: 100,
      kind: 'deposit',
    })
  })

  it('rejects a deposit for a blank account', () => {
    expect(() => recordDeposit('   ', 100)).toThrow('account is required')
  })

  it('rejects a deposit with a non-positive amount', () => {
    expect(() => recordDeposit('alice', 0)).toThrow(
      'amount must be a positive number',
    )
  })

  it('rejects a deposit with more than two decimal places', () => {
    expect(() => recordDeposit('alice', 1.234)).toThrow(
      'amount must have at most two decimal places',
    )
  })

  it('records a withdrawal entry', () => {
    expect(recordWithdrawal('  Bob ', 40)).toEqual({
      account: 'bob',
      amount: -40,
      kind: 'withdrawal',
    })
  })
})
`

// The pending write: a new test that starts a recordTransfer cycle,
// skipping the extraction of the duplicated normalize-and-validate block.
export const LEDGER_TESTS_WITH_TRANSFER = `import { describe, expect, it } from 'vitest'

import { recordDeposit, recordTransfer, recordWithdrawal } from './ledger.js'

describe('ledger', () => {
  it('normalizes the account and records a deposit entry', () => {
    expect(recordDeposit('  Alice  ', 100)).toEqual({
      account: 'alice',
      amount: 100,
      kind: 'deposit',
    })
  })

  it('rejects a deposit for a blank account', () => {
    expect(() => recordDeposit('   ', 100)).toThrow('account is required')
  })

  it('rejects a deposit with a non-positive amount', () => {
    expect(() => recordDeposit('alice', 0)).toThrow(
      'amount must be a positive number',
    )
  })

  it('rejects a deposit with more than two decimal places', () => {
    expect(() => recordDeposit('alice', 1.234)).toThrow(
      'amount must have at most two decimal places',
    )
  })

  it('records a withdrawal entry', () => {
    expect(recordWithdrawal('  Bob ', 40)).toEqual({
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

// --- Test 2: recordDeposit and recordWithdrawal read as near-duplicates,
// but the shared part is a thin three-call delegating sequence
// (policy/store), not a substantial block. Extracting it is a judgment call
// that may add indirection for little gain, so the validator defers to the
// agent rather than forcing it. ---

// The current test file at green: deposit + withdrawal cycles complete.
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

// The pending write: a new test that starts a recordTransfer cycle. The
// only apparent refactor is a judgment call, not a clear win, so this
// should be allowed.
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
