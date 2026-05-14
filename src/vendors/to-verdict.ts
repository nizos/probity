import { z } from 'zod'

import type { Verdict } from '../types.js'

const VerdictSchema = z.object({
  kind: z.enum(['pass', 'violation']),
  reason: z.string(),
})

/**
 * Turns a "give me text from the validator" call into a Verdict.
 * Centralises the fail-closed contract every agent shares: a thrown
 * getText becomes a `violation` verdict whose reason is the error
 * message; the returned string is JSON-parsed (with optional ```json
 * fence stripping) and validated against the verdict shape, with
 * fail-closed for malformed or unexpected responses. Each agent
 * (claude-code, codex, github-copilot) supplies its own transport
 * closure and lets this helper own the verdict shape.
 */
export async function toVerdict(
  getText: () => Promise<string>,
): Promise<Verdict> {
  try {
    return parseVerdict(await getText())
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'violation', reason }
  }
}

function parseVerdict(text: string): Verdict {
  const parsed = tryParseJson(text)
  if (parsed === undefined) {
    return {
      kind: 'violation',
      reason: `could not parse verdict from validator output: ${text.slice(0, 4000)}`,
    }
  }
  const result = VerdictSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where =
      issue && issue.path.length > 0 ? issue.path.join('.') : '<root>'
    const what = issue?.message ?? 'unknown shape error'
    return {
      kind: 'violation',
      reason: `validator returned unexpected shape at ${where}: ${what}`,
    }
  }
  return result.data
}

/**
 * Tries the whole text, then the text minus a ```json fence, then
 * scans for a JSON object embedded after prose. Models often "show
 * their work" before the answer; the verdict object lives at the end.
 */
function tryParseJson(text: string): unknown {
  return (
    safeParse(text.trim()) ??
    safeParse(stripFence(text)) ??
    findEmbeddedObject(text)
  )
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function stripFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

function findEmbeddedObject(text: string): unknown {
  const opens = [...text.matchAll(/\{/g)].map((m) => m.index ?? 0).reverse()
  for (const start of opens) {
    const span = scanBalanced(text, start)
    const parsed = span === undefined ? undefined : safeParse(span)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

/**
 * Returns the substring of `text` from `start` (a `{`) up to its
 * matching `}`, or undefined if the braces don't balance.
 */
function scanBalanced(text: string, start: number): string | undefined {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
    } else if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === '{') {
      depth++
    } else if (c === '}' && --depth === 0) {
      return text.slice(start, i + 1)
    }
  }
  return undefined
}
