// Test-file shapes and implementation shapes used by every
// enforce-tdd integration test. The three vendor suites
// (claude-code, codex, github-copilot) all assert the same property —
// "enforceTdd allows/denies a minimal/over-impl write" — so the
// fixture content is shared; what varies per file is the vendor
// payload shape and response decoding.

export const EXISTING_TEST_CONTENT = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})
`

export const PLUS_ONE_TEST = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })
})
`

export const PLUS_TWO_TESTS = `import { describe, expect, it } from 'vitest'
import { add } from './calculator.js'

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2)
  })

  it('adds zeros', () => {
    expect(add(0, 0)).toBe(0)
  })
})
`

export const MINIMAL_IMPL = `export function add(a: number, b: number): number {
  return a + b
}
`

export const OVER_IMPL = `export function add(a: number, b: number): number {
  return a + b
}
export function subtract(a: number, b: number): number {
  return a - b
}
export function multiply(a: number, b: number): number {
  return a * b
}
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero')
  return a / b
}
export function power(a: number, b: number): number {
  return Math.pow(a, b)
}
export function sqrt(a: number): number {
  return Math.sqrt(a)
}
`

export const MODULO_STUB_IMPL = `export function modulo(a: number, b: number): number {
  return 0
}
`

/**
 * A test suite mid-migration from a per-test `setupFile` helper to the
 * shared `makeFile` fixture. The imports `setupFile` relied on are gone,
 * so it is dead code referencing undefined identifiers.
 * {@link DEAD_HELPER_STILL_CALLED} is the before state (the helper is
 * still called); {@link DEAD_HELPER_CALLER_MIGRATED} is the pending write
 * that migrates the only caller, leaving the dead helper orphaned. One
 * behavior-preserving refactor step through a transient broken state.
 */
export const DEAD_HELPER_STILL_CALLED = `import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../../test/helpers/sandbox.js'
import { parseAction } from './adapter.js'

const it = baseTest
  .extend('dir', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('makeFile', ({ dir }) => async (content: string) => {
    const filePath = path.join(dir, 'foo.ts')
    await writeFile(filePath, content)
    return filePath
  })

describe('adapter edits', () => {
  it('replaces the matched marker', async () => {
    const filePath = await setupFile('before\\nMARKER\\nafter\\n')
    expect((await parseAction(filePath)).ok).toBe(true)
  })
})

async function setupFile(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'copilot-edit-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, 'foo.ts')
  await writeFile(filePath, content)
  return filePath
}
`

export const DEAD_HELPER_CALLER_MIGRATED = `import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test as baseTest } from 'vitest'

import { makeSandboxDir } from '../../../test/helpers/sandbox.js'
import { parseAction } from './adapter.js'

const it = baseTest
  .extend('dir', ({}, { onCleanup }) => makeSandboxDir(onCleanup))
  .extend('makeFile', ({ dir }) => async (content: string) => {
    const filePath = path.join(dir, 'foo.ts')
    await writeFile(filePath, content)
    return filePath
  })

describe('adapter edits', () => {
  it('replaces the matched marker', async ({ makeFile }) => {
    const filePath = await makeFile('before\\nMARKER\\nafter\\n')
    expect((await parseAction(filePath)).ok).toBe(true)
  })
})

async function setupFile(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'copilot-edit-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, 'foo.ts')
  await writeFile(filePath, content)
  return filePath
}
`

/**
 * Removing an in-use function. {@link USED_FN_PRESENT} exports `greet`,
 * `farewell`, and a `conversation` that calls both.
 * {@link USED_FN_REMOVED} is the pending write that deletes `farewell`,
 * leaving `conversation` referencing a now-removed name (a transient
 * broken state). This is removal of live behavior, and no failing test
 * drives it.
 */
export const USED_FN_PRESENT = `export function greet(name: string): string {
  return \`Hello, \${name}\`
}

export function farewell(name: string): string {
  return \`Goodbye, \${name}\`
}

export function conversation(name: string): string {
  return \`\${greet(name)}. \${farewell(name)}\`
}
`

export const USED_FN_REMOVED = `export function greet(name: string): string {
  return \`Hello, \${name}\`
}

export function conversation(name: string): string {
  return \`\${greet(name)}. \${farewell(name)}\`
}
`

/**
 * "Looks like a test file" heuristic. Used by setups to place the
 * pending write under target.test.ts vs target.ts so the rule's
 * "is this a test or impl?" classifier sees the expected name.
 */
export function targetFilename(content: string): string {
  return /describe\(|\bit\(/.test(content) ? 'target.test.ts' : 'target.ts'
}
