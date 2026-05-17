import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'

export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024

/**
 * Read a bounded JSONL file and return one parsed entry per non-empty
 * line. Lines that fail to JSON.parse are silently dropped (best-effort
 * recovery from partial writes). Refuses symlinks and files larger than
 * `maxBytes` (default 100 MiB) — both are guards against transcript
 * paths that could point at unintended large or sensitive files.
 */
export async function readJsonl(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<unknown[]> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const handle = await openNoFollow(path)
  try {
    const raw = await readBoundedUtf8(handle, maxBytes, path)
    const entries: unknown[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Skip malformed lines.
      }
    }
    return entries
  } finally {
    await handle.close()
  }
}

/**
 * Reads up to `maxBytes` from `handle` and throws if there's more. The
 * bounded `handle.read` (rather than `stat + readFile`) closes the
 * TOCTOU window where a concurrent writer could grow the file past the
 * cap between size check and read.
 */
async function readBoundedUtf8(
  handle: FileHandle,
  maxBytes: number,
  path: string,
): Promise<string> {
  const buf = Buffer.alloc(maxBytes + 1)
  const { bytesRead } = await handle.read(buf, 0, maxBytes + 1, 0)
  if (bytesRead > maxBytes) {
    throw new Error(`file at ${path} exceeds ${maxBytes} bytes`)
  }
  return buf.subarray(0, bytesRead).toString('utf8')
}

async function openNoFollow(path: string): Promise<FileHandle> {
  try {
    return await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ELOOP') {
      throw new Error(`file at ${path} is a symbolic link (refusing)`)
    }
    throw err
  }
}
