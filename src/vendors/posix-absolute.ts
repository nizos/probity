import path from 'node:path'

/**
 * Resolve `p` against `cwd`, returning forward slashes. The resolver
 * style follows the path that is absolute: a Windows `p` resolves with
 * `path.win32`, a POSIX `p` with `path.posix`; a relative `p` inherits
 * `cwd`'s style. Agents running elsewhere report POSIX roots like
 * `/workspaces/...`; resolving those with the host `path.resolve`
 * would invent a drive prefix (`C:/workspaces/...`) on Windows and
 * silently shift every path-scoped rule.
 */
const WINDOWS_ROOT = /^(?:[a-zA-Z]:[\\/]|\\\\)/

export function posixAbsolute(cwd: string, p: string): string {
  const resolved =
    WINDOWS_ROOT.test(p) || (!p.startsWith('/') && WINDOWS_ROOT.test(cwd))
      ? path.win32.resolve(cwd, p)
      : path.posix.resolve(cwd, p)
  return resolved.replace(/\\/g, '/')
}
