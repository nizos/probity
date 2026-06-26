import type { Action, RawSessionEvent, RuleResult } from '../types.js'
import type { FileContent, RuleContext } from './contract.js'
import { countNewTestNodes } from './matchers/count-new-test-nodes.js'
import { inferLanguage } from './matchers/languages/index.js'
import { trimHistory, type HistoryWindow } from './trim-history.js'

const DEFAULT_MAX_EVENTS = 10
const DEFAULT_MAX_CONTENT_CHARS = 6000

const PROCESS_INSTRUCTIONS = `## Role

You are a TDD validator. Judge whether the pending write follows
test-driven development.

## Inputs

You will see three inputs:

1. "Recent session" — a chronological log of the agent's recent prompts
   and tool actions. Each entry shows what the agent did and what it
   observed back. Use this to find evidence of a failing test that the
   pending write would address.
2. "Current file content" — what's on disk right now at the file the
   agent is about to write. May be a parenthesized marker (e.g.
   \`(file does not exist)\`) when content cannot be shown.
3. "Pending action" — what the agent is about to write. Content may be
   raw file text or a patch/diff in any common format.

## What you judge

Judge the change this write makes (the difference between the current
file content and the pending action), not the resulting file as a
whole.

A transient file state is never itself a violation, however broken the
file looks: an unresolved symbol, a dead or unused definition, a
duplicated declaration, a reference to a removed name, a half-finished
multi-step change. Whether the file is internally consistent or runs
after the write is checked when the agent next runs the tests, not by
you. This allowance is about structure; it does not excuse skipping a
failing test or over-implementing, which the rules below still catch.

A block or denial message recorded earlier in the session is a past
verdict, not a rule. Re-derive your judgment from the rules below as
if it had not been issued; never block only because a previous attempt
was blocked.

## Multi-step changes

A phase may span multiple writes, each fine on its own. For example:

  - Add an import in one write, then change the calling code in the
    next.
  - Move a function in two writes (remove from one location, add at
    another).
  - Add a function signature in one write, then its body in the next.
  - Remove a function in one write, then its call sites in the next.`

const DEFAULT_TDD_RULES = `## TDD rules

The TDD cycle is Red -> Green -> Refactor. Each phase has its own rules.

### Across all phases

Deleting code, tests, or helpers never requires a failing test to drive
it, even when the removed code was used or test-covered.

### Red phase: write a failing test first

A single write should add at most one new test. Compare current file
content with pending action to count newly added tests; existing
tests do not count. Restructuring existing tests is not "adding".

  - Adding a test is always allowed and does not require prior test
    output.
  - A test added to drive new behavior must be observed failing for
    the right reason (an assertion, not a syntax or import error) in
    a prior test run before production code may be written to satisfy
    it.
  - A test added to capture existing behavior is allowed to pass
    immediately and must not be blocked for not failing first.
    Examples: characterization tests pinning current implementation,
    tests at a new layer (e.g. an e2e covering code already exercised
    by units), pinning tests added before a refactor pulls a seam out
    from under them.
  - Test-file scaffolding edits (imports, helpers, fixtures) need no
    failing test on their own.

#### Reaching a clean red

A test can fail before reaching an assertion (import unresolved,
signature mismatch). The agent may resolve these without violating TDD:

  - Import or symbol unresolved -> create a placeholder stub: a body
    that makes the symbol exist but does not implement the behavior the
    test asserts. Returning a literal that contradicts the assertion
    (e.g. \`=> 0\` when the test expects \`1\`) or throwing
    \`not implemented\` are both valid stubs; they exist solely to
    surface a real assertion failure on the next test run.
  - Signature mismatch -> adjust signature; keep the body as a
    placeholder stub per the rule above.
  - Assertion failure -> implement minimal logic to pass.

A stub-resolution step must not implement the test's asserted behavior.
Returning a literal that the assertion will reject IS a stub.

### Green phase: minimum to pass

The implementation must not exceed the minimum needed to make the
observed failing test pass. Functions, classes, or branches not
required by the currently failing test are over-implementation. An
import or other scaffolding awaiting a later write in the same change
is a transient state, not over-implementation.

### Refactor phase: improve structure under green

Refactoring does not require a failing test to drive it. Production
and test edits that preserve observable behavior are allowed when
the relevant tests were passing before the refactor began. Examples:

  - Extracting helpers whose behavior already lives elsewhere (covered
    by existing tests). Extracting a helper whose behavior appears
    nowhere else is net new and requires a failing test first.
  - Lifting test setup (fixtures, builders, factories) into a
    dedicated or reusable helper. The helper is exercised by the tests
    that call it; no separate test for the helper is required.
  - Adding type declarations, interfaces, or constant literals
    (no runtime behavior by construction).
  - Renaming, restructuring control flow, removing dead code.
  - Reorganizing or deleting redundant tests, or splitting/combining
    existing tests. The one-new-test rule is about intent to add
    behavior, not surface diff count.

## Validator behavior

### Block messages

Name the violation and say why it breaks TDD. Do not dictate edit
order, require the file to be complete or runnable, or demand other
steps be bundled into this write.`

const RESPONSE_SPEC = `## Response format

Respond with a single JSON object of exactly this shape:
{"kind":"pass"|"violation","reason":"<short explanation>"}
On "pass", leave reason an empty string (""); only a "violation" needs an explanation.
Return JSON only. No prose, no code fences.`

function formatEvent(event: RawSessionEvent): string {
  if (event.kind === 'prompt') return `User: ${event.text}`
  return `${event.tool}(${formatInput(event.input)}) → ${event.output}`
}

function formatInput(input: unknown): string {
  if (typeof input === 'string') return input
  return JSON.stringify(input)
}

function buildPrompt(
  rules: string,
  historyBlock: string,
  before: FileContent,
  action: { path: string; content: string },
): string {
  const sections = [PROCESS_INSTRUCTIONS, rules]
  if (historyBlock) sections.push(`## Recent session\n\n${historyBlock}`)
  sections.push(`## Current file content\n\n${formatBefore(before)}`)
  sections.push(
    `## Pending action\n\nFile: ${action.path}\n\n${action.content}`,
  )
  sections.push(RESPONSE_SPEC)
  return sections.join('\n\n')
}

function formatBefore(before: FileContent): string {
  switch (before.kind) {
    case 'present':
      return before.content
    case 'absent':
      return '(file does not exist)'
    case 'unknown':
      return '(current file content unavailable)'
  }
}

/**
 * Blocks a write unless the session's recent history shows a failing
 * test that the pending implementation would address, and the write
 * is the minimum implementation needed to make that test pass. Uses
 * an AI validator (via `ctx.agent.reason`) to judge the pending action
 * against the transcript.
 *
 * Applies to: write actions.
 * Supported agents: Claude Code, Codex, GitHub Copilot.
 *
 * Cost note: matching writes trigger an AI call unless the fast-path
 * applies (see `fastPath`). Scope with a `{ files, rules }` block so
 * the rule only fires on the code you care about.
 *
 * @param options.instructions — overrides or extends the default TDD
 *   rules text the validator is given. The role, inputs, and response
 *   format stay regardless; only the rules text changes. Pass a string
 *   to replace the defaults outright, or a function `(defaults) => ...`
 *   to extend them (e.g. append a project-specific addendum without
 *   forking the whole TDD spec). Defaults to a Red-Green-Refactor spec
 *   covering test-first, one-new-test-per-write, minimum implementation,
 *   clean-red recovery, and refactors under green.
 * @param options.maxEvents — keep at most this many of the most
 *   recent session events when building the prompt (default 10).
 *   Raise it for long-running tasks that span many tool calls; pushing
 *   it too high crowds the prompt and the model may miss recent
 *   events or stop following the response format.
 * @param options.maxContentChars — truncate any single event's
 *   text/output longer than this, with a head + tail + marker
 *   replacement (default 6000). Raise it when working with large
 *   files so context isn't lopped mid-region; same caveat as
 *   maxEvents about over-stuffing the prompt.
 * @param options.fastPath — when a write to a recognized language adds
 *   exactly one new test node, return pass without calling the AI
 *   (default false). Off by default because a deterministic pass on
 *   every new test lets an agent skip the refactor phase: the
 *   green->red boundary is exactly where the AI checks whether the
 *   prior green left a refactor unmade. Set to `true` to allow
 *   single-test additions without an AI call and cut cycle time when
 *   refactor enforcement is not a concern.
 *
 * @example
 * enforceTdd()
 *
 * @example
 * { files: ['src/**', '!src/**\/*.test.ts'], rules: [enforceTdd()] }
 */
export function enforceTdd(
  options: {
    instructions?: string | ((defaults: string) => string)
    maxEvents?: number
    maxContentChars?: number
    fastPath?: boolean
  } = {},
) {
  const rules =
    typeof options.instructions === 'function'
      ? options.instructions(DEFAULT_TDD_RULES)
      : (options.instructions ?? DEFAULT_TDD_RULES)
  const window: HistoryWindow = {
    maxEvents: options.maxEvents ?? DEFAULT_MAX_EVENTS,
    maxContentChars: options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS,
  }
  const fastPath = options.fastPath ?? false
  return async function enforceTdd(
    action: Action,
    ctx?: RuleContext,
  ): Promise<RuleResult> {
    if (action.kind !== 'write') return { kind: 'pass' }
    const before: FileContent = (await ctx?.readFile?.(action.path)) ?? {
      kind: 'unknown',
    }
    if (fastPath && isSingleNewTest(action, before)) {
      return { kind: 'pass', notes: [{ kind: 'fast-path' }] }
    }
    return validateWithAi(action, ctx, before, rules, window)
  }
}

/**
 * The fast-path is a deterministic check on `count_after - count_before === 1`.
 * `unknown` leaves `count_before` unknowable, so any delta we compute is
 * unverifiable; fall through to the AI rather than risk a false-pass.
 */
function isSingleNewTest(
  action: { path: string; content: string },
  before: FileContent,
): boolean {
  if (before.kind === 'unknown') return false
  const language = inferLanguage(action.path)
  if (!language) return false
  const beforeText = before.kind === 'present' ? before.content : ''
  return countNewTestNodes(beforeText, action.content, language) === 1
}

async function validateWithAi(
  action: { path: string; content: string },
  ctx: RuleContext | undefined,
  before: FileContent,
  rules: string,
  window: HistoryWindow,
): Promise<RuleResult> {
  if (!ctx?.agent) {
    return {
      kind: 'violation',
      reason:
        'enforceTdd: no AI agent available; configure Config.ai or use a vendor that ships one.',
    }
  }
  const events = (await ctx.rawHistory?.()) ?? []
  const windowed = trimHistory(events, window)
  const historyBlock = windowed.map(formatEvent).join('\n')
  const prompt = buildPrompt(rules, historyBlock, before, action)
  const verdict = await ctx.agent.reason(prompt)
  if (verdict.kind === 'violation') {
    return { kind: 'violation', reason: verdict.reason }
  }
  return { kind: 'pass', reason: verdict.reason }
}
