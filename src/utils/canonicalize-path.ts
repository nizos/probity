import { realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Symlink-resolved form of an absolute path. A write can target a file
 * that doesn't exist yet, so the longest existing ancestor is resolved
 * and the rest re-appended. `resolve` is injectable so a Windows-shaped
 * result (backslashes) can be exercised without a Windows host; it
 * defaults to the real native realpath.
 */
export function canonicalizePath(
  p: string,
  resolve: (p: string) => string = realpathSync.native,
): string {
  const tail: string[] = []
  let current = p
  for (;;) {
    try {
      const resolved = resolve(current).replace(/\\/g, '/')
      return path.posix.join(resolved, ...tail)
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return p
      tail.unshift(path.basename(current).replace(/\\/g, '/'))
      current = parent
    }
  }
}
