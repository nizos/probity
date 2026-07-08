import { z } from 'zod'

import type { Action, Decision } from '../../types.js'
import { fromSchema, passthroughFor } from '../adapter.js'
import { posixAbsolute } from '../posix-absolute.js'

/**
 * The JSON shape `toResponse` emits on a block decision. Codex's hook
 * format is documented but not shipped as a type by `@openai/codex-sdk`,
 * so we declare it alongside the function that produces it.
 */
export type ResponseShape = { decision: string; reason: string }

const PATCH_FILE_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm

/**
 * Splits an apply_patch command into one section per file, keyed by the
 * `*** Add/Update/Delete File:` headers. Each section runs from its
 * header up to the next header (or the end of the patch), so a
 * multi-file patch yields one write per file instead of collapsing to
 * the first header — files 2..N would otherwise escape path-scoped
 * rules entirely.
 */
function splitPatchFiles(command: string): { path: string; section: string }[] {
  const headers = [...command.matchAll(PATCH_FILE_HEADER)]
  return headers.map((header, i) => {
    const start = header.index ?? 0
    const next = headers[i + 1]?.index ?? command.length
    return { path: header[1]!.trim(), section: command.slice(start, next) }
  })
}

const bashSchema = z.object({
  tool_name: z.literal('Bash'),
  tool_input: z.object({ command: z.string() }),
})

const applyPatchSchema = z.object({
  tool_name: z.literal('apply_patch'),
  tool_input: z.object({ command: z.string() }),
  cwd: z.string().min(1),
})

/**
 * The validated payload shape for an apply_patch tool call. Intersect
 * with the ceremony fields the SDK sends (session_id, turn_id, etc.)
 * when stamping out test payloads so the validated portion tracks the
 * adapter automatically.
 */
export type WriteInput = z.input<typeof applyPatchSchema>

const writeToolsSchema = z.discriminatedUnion('tool_name', [
  bashSchema.transform((d): Action => ({
    kind: 'command',
    command: d.tool_input.command,
  })),
  applyPatchSchema.transform((d, ctx): Action[] => {
    const files = splitPatchFiles(d.tool_input.command)
    if (files.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'apply_patch: no Add/Update/Delete File header',
      })
      return z.NEVER
    }
    // One Action per file so files 2..N are not skipped by path-scoped
    // rules or per-file enforce-tdd. Each carries its own patch section
    // as content (rather than the whole patch) so content rules see only
    // that file's changes.
    return files.map((file) => ({
      kind: 'write',
      path: posixAbsolute(d.cwd, file.path),
      content: file.section,
    }))
  }),
])

/**
 * Anything Codex fires the hook for that we don't explicitly model
 * (future tools, or a broader user matcher than the recommended
 * `^(Bash|apply_patch|Edit|Write)$`) becomes a no-op command.
 * `passthroughFor` excludes the known tool names so a malformed
 * Bash / apply_patch payload still surfaces as a parse error rather
 * than silently passing through.
 */
const passthroughSchema = passthroughFor('tool_name', ['Bash', 'apply_patch'])

export const parseAction = fromSchema(
  z.union([writeToolsSchema, passthroughSchema]),
)

const ContextPayloadSchema = z.object({ transcript_path: z.string() })

export function sessionPath(payload: unknown): string | undefined {
  const parsed = ContextPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data.transcript_path : undefined
}

export function toResponse(decision: Decision): string {
  if (decision.kind === 'block') {
    return JSON.stringify({ decision: 'block', reason: decision.reason })
  }
  return ''
}
