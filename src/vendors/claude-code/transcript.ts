import { readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { z } from 'zod'

import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'
import { StringOrTextBlocks } from '../string-or-text-blocks.js'

const ContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_use'),
    name: z.string(),
    id: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    content: StringOrTextBlocks,
    tool_use_id: z.string(),
  }),
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
])

const EntrySchema = z.object({
  type: z.string().optional(),
  timestamp: z.string().optional(),
  message: z.object({ content: z.array(z.unknown()) }).optional(),
})

export async function readTranscript(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<RawSessionEvent[]> {
  const sources = [path, ...(await listSubagentTranscripts(path))]
  const batches = await Promise.all(sources.map((p) => readJsonl(p, options)))
  return parseEntries(mergeChronologically(batches))
}

/**
 * Concatenates each source's entries in source order, then stably
 * sorts the whole thing by each entry's own `timestamp`. Entries
 * without one (or ties) keep their position from that initial
 * concatenation — main first, then each subagent file in the order
 * `listSubagentTranscripts` returned them — so untimestamped fixtures
 * behave exactly as before. Sorting raw entries (rather than each
 * source's parsed events) matters because a subagent can run
 * concurrently with, or interleaved between, the main transcript's own
 * actions; parsing each source in isolation first would fix that
 * source's internal order but not its position relative to the others.
 */
function mergeChronologically(batches: unknown[][]): unknown[] {
  return batches
    .flat()
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ta = EntrySchema.safeParse(a.entry)
      const tb = EntrySchema.safeParse(b.entry)
      const sa = (ta.success && ta.data.timestamp) || ''
      const sb = (tb.success && tb.data.timestamp) || ''
      if (sa < sb) return -1
      if (sa > sb) return 1
      return a.index - b.index
    })
    .map(({ entry }) => entry)
}

/**
 * Claude Code writes each spawned subagent's tool calls to its own
 * transcript under a `subagents/` directory inside a folder named
 * after the session (the main transcript's own basename, e.g.
 * `<uuid>.jsonl` sits beside a `<uuid>/subagents/agent-<id>.jsonl`),
 * not into the main transcript itself. Without merging them in, tests
 * a subagent runs are invisible to history-reading rules like
 * `enforceTdd`.
 */
async function listSubagentTranscripts(mainPath: string): Promise<string[]> {
  const sessionDir = basename(mainPath, extname(mainPath))
  const dir = join(dirname(mainPath), sessionDir, 'subagents')
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .map((name) => join(dir, name))
}

function parseEntries(entries: unknown[]): RawSessionEvent[] {
  const pending = new Map<string, RawSessionEvent>()
  const emitted: RawSessionEvent[] = []

  for (const rawEntry of entries) {
    const entry = EntrySchema.safeParse(rawEntry)
    if (!entry.success) continue
    const content = entry.data.message?.content
    if (!content) continue
    for (const c of content) {
      const parsed = ContentItemSchema.safeParse(c)
      if (!parsed.success) continue
      const item = parsed.data
      if (item.type === 'tool_use') {
        const action: RawSessionEvent = {
          kind: 'action',
          tool: item.name,
          input: item.input,
          output: '',
          toolUseId: item.id,
        }
        pending.set(item.id, action)
        emitted.push(action)
      } else if (item.type === 'tool_result') {
        const existing = pending.get(item.tool_use_id)
        if (existing && existing.kind === 'action') {
          existing.output = item.content
        }
      } else if (item.type === 'text' && entry.data.type === 'user') {
        emitted.push({ kind: 'prompt', text: item.text })
      }
    }
  }
  return emitted
}
