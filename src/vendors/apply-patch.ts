const PATCH_FILE_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm

/**
 * Splits an apply_patch command into one section per file, keyed by the
 * `*** Add/Update/Delete File:` headers. Each section runs from its
 * header up to the next header (or the end of the patch), so a
 * multi-file patch yields one write per file instead of collapsing to
 * the first header — files 2..N would otherwise escape path-scoped
 * rules entirely.
 *
 * Shared by every adapter whose harness emits OpenAI-style apply_patch
 * writes (Codex directly, and Codex models running inside Copilot CLI),
 * so the split stays identical wherever the patch shape appears.
 */
export function splitPatchFiles(
  command: string,
): { path: string; section: string }[] {
  const headers = [...command.matchAll(PATCH_FILE_HEADER)]
  return headers.map((header, i) => {
    const start = header.index ?? 0
    const next = headers[i + 1]?.index ?? command.length
    return { path: header[1]!.trim(), section: command.slice(start, next) }
  })
}
