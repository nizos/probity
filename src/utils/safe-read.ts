import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'

import type { FileContent } from '../rules/contract.js'

/**
 * Reads a file's content with hardened semantics. Returns:
 * - `present` with content when the read succeeds within `maxBytes`
 * - `absent` when the file doesn't exist (ENOENT)
 * - `unknown` for everything else: symlink refusal (O_NOFOLLOW),
 *   over-cap content, permission errors, transient I/O failures
 *
 * Distinct from a thrown error: rules treat `unknown` as "can't decide
 * from disk, fall through to the AI" rather than failing the action.
 */
export async function safeReadCapped(
  path: string,
  options: { maxBytes?: number } = {},
): Promise<FileContent> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      return await readBounded(handle, options.maxBytes)
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return { kind: 'absent' }
    return { kind: 'unknown' }
  }
}

async function readBounded(
  handle: FileHandle,
  maxBytes: number | undefined,
): Promise<FileContent> {
  if (maxBytes === undefined) {
    return { kind: 'present', content: await handle.readFile('utf8') }
  }
  const buf = Buffer.alloc(maxBytes + 1)
  const { bytesRead } = await handle.read(buf, 0, maxBytes + 1, 0)
  if (bytesRead > maxBytes) return { kind: 'unknown' }
  return {
    kind: 'present',
    content: buf.subarray(0, bytesRead).toString('utf8'),
  }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === code
  )
}
