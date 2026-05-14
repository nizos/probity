import { spawn } from 'node:child_process'
import path from 'node:path'

export type RunBinResult = { stdout: string; stderr: string }

export type RunBinOptions = {
  // Path to the probity binary. Resolved relative to the test process's cwd.
  // Defaults to `dist/bin.js`.
  binPath?: string
  args?: readonly string[]
  // Working directory for the spawned child. If omitted, the child inherits
  // the test process's cwd (Node's default).
  cwd?: string
  // Written to stdin and stdin is then closed.
  payload?: string
}

/**
 * Spawns the probity bin as a child process, writes `payload` to stdin,
 * and collects stdout/stderr. Used by integration tests that need real
 * process boundaries (argv parsing, --agent dispatch, exit behavior)
 * instead of calling `run()` from src/cli.js directly.
 *
 * Throws if the child exits with a non-zero code or is terminated by a
 * signal, so a crashed bin can't masquerade as an `allow` (empty stdout).
 */
export async function runBin(opts: RunBinOptions = {}): Promise<RunBinResult> {
  const binPath = path.resolve(opts.binPath ?? 'dist/bin.js')
  const child = spawn(process.execPath, [binPath, ...(opts.args ?? [])], {
    ...(opts.cwd !== undefined && { cwd: opts.cwd }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
  child.stdin.end(opts.payload ?? '')
  const { code, signal } = await new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve, reject) => {
    child.on('close', (c, s) => resolve({ code: c, signal: s }))
    child.on('error', reject)
  })
  const stdout = Buffer.concat(stdoutChunks).toString()
  const stderr = Buffer.concat(stderrChunks).toString()
  if (code !== 0) {
    throw new Error(
      `probity bin exited unexpectedly (code=${code}${signal ? `, signal=${signal}` : ''})\nstderr: ${stderr || '(empty)'}`,
    )
  }
  return { stdout, stderr }
}
