import path from 'node:path'

export function posixAbsolute(cwd: string, p: string): string {
  return path.resolve(cwd, p).replace(/\\/g, '/')
}
