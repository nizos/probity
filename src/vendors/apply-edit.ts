import { readFile } from 'node:fs/promises'

export type ApplyEditOptions = {
  filePath: string
  oldString: string
  newString: string
  replaceAll?: boolean
}

export type ApplyEditResult =
  | { ok: true; content: string }
  | { ok: false; reason: string }

/**
 * Reads the file at `filePath` and applies the substitution requested
 * by an Edit-style tool call. Mirrors the vendor (Claude Code Edit)
 * contract: with `replaceAll = false` (default), `oldString` must
 * occur exactly once; with `replaceAll = true`, every occurrence is
 * replaced. Returns a fail-closed result on miss/non-unique/missing
 * file rather than silently producing unchanged content — that
 * silent fallback is the bug class this helper exists to extinguish.
 */
export async function applyEdit(
  options: ApplyEditOptions,
): Promise<ApplyEditResult> {
  const { filePath, replaceAll = false } = options
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      reason: `could not read ${filePath}: ${message}`,
    }
  }
  const current = toLF(raw)
  const oldString = toLF(options.oldString)
  const newString = toLF(options.newString)
  const occurrences = countOccurrences(current, oldString)
  if (occurrences === 0) {
    return {
      ok: false,
      reason: `oldString not found in ${filePath} — likely a stale view of the file (line endings, whitespace, or content drift).`,
    }
  }
  if (occurrences > 1 && !replaceAll) {
    return {
      ok: false,
      reason: `oldString matches ${occurrences} locations in ${filePath}; the Edit contract requires uniqueness unless replace_all is true.`,
    }
  }
  // Insert newString via a replacer function so it lands verbatim: a
  // string replacement would interpret $$, $&, $` and $' as special
  // patterns, diverging from the vendor's literal edit and making the
  // engine evaluate bytes the agent never wrote.
  const replacer = () => newString
  const content = replaceAll
    ? current.replaceAll(oldString, replacer)
    : current.replace(oldString, replacer)
  return { ok: true, content }
}

/**
 * Files persisted on Windows commonly use CRLF while agents normalize
 * the JSON payload to LF; matching in LF-space avoids spurious misses.
 */
function toLF(s: string): string {
  return s.replace(/\r\n/g, '\n')
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let from = 0
  while (true) {
    const i = haystack.indexOf(needle, from)
    if (i === -1) return count
    count++
    from = i + needle.length
  }
}
