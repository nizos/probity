import { constants } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { RawSessionEvent } from '../../types.js'
import { readJsonl } from '../../utils/read-jsonl.js'

const envelope = z.object({
  session_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),
  hook_event_name: z.enum(['PreToolUse', 'PostToolUse', 'UserPromptSubmit']),
  cwd: z.string().min(1).optional(),
})
const prompt = z.object({ prompt: z.string() })
const result = z.object({
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_use_id: z.string(),
  tool_response: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().nullable(),
  }),
})
const event = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt'), text: z.string() }),
  z.object({
    kind: z.literal('action'),
    tool: z.string(),
    input: z.unknown(),
    output: z.string(),
    toolUseId: z.string(),
  }),
])

/** Devin does not supply a transcript path; persist only prompts and completed results. */
export async function preparePayload(
  payload: unknown,
): Promise<Record<string, unknown>> {
  const d = envelope.parse(payload)
  const cwd = d.cwd ?? process.env.DEVIN_PROJECT_DIR ?? process.cwd()
  const root = path.join(cwd, '.probity')
  const directory = path.join(root, 'devin')
  const transcript_path = path.join(directory, `${d.session_id}.jsonl`)
  let entry: RawSessionEvent | undefined
  if (d.hook_event_name === 'UserPromptSubmit') {
    entry = { kind: 'prompt', text: prompt.parse(payload).prompt }
  } else if (d.hook_event_name === 'PostToolUse') {
    const done = result.parse(payload)
    entry = {
      kind: 'action',
      tool: done.tool_name,
      input: done.tool_input,
      output: [done.tool_response.output, done.tool_response.error]
        .filter(Boolean)
        .join('\n'),
      toolUseId: done.tool_use_id,
    }
  }
  for (const dir of [root, directory]) {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const info = await lstat(dir)
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error('Devin history directory must not be a symlink')
  }
  const handle = await open(
    transcript_path,
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    // Windows does not enforce O_NOFOLLOW; verify the opened file before writing.
    const named = await lstat(transcript_path)
    const opened = await handle.stat()
    if (
      named.isSymbolicLink() ||
      !named.isFile() ||
      named.ino !== opened.ino ||
      named.dev !== opened.dev
    )
      throw new Error(
        'Devin history file must not be a symlink or substituted file',
      )
    await handle.writeFile(entry ? JSON.stringify(entry) + '\n' : '', 'utf8')
  } finally {
    await handle.close()
  }
  return { ...(payload as Record<string, unknown>), cwd, transcript_path }
}

export async function readTranscript(file: string): Promise<RawSessionEvent[]> {
  if ((await lstat(file)).isSymbolicLink())
    throw new Error('Devin history file must not be a symlink')
  const entries = await readJsonl(file)
  return entries.map((raw) => event.parse(raw))
}
