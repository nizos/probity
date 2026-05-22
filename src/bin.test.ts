import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, onTestFinished } from 'vitest'

import { main, type MainResult } from './bin.js'
import type { ConfigLoader } from './cli.js'
import type { Config } from './config.js'
import type { Agent } from './types.js'
import { enforceFilenameCasing } from './rules/enforce-filename-casing.js'
import { parseAs } from './utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from './vendors/claude-code/adapter.js'

describe('bin main', () => {
  it('returns exit code 2 and a helpful stderr when --agent is missing', async () => {
    const result = await setup({ argv: ['node', 'bin.js'] })

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toMatch(/--agent/)
    expect(result.stderr).toMatch(/missing/)
  })

  it('returns exit code 2 and lists known agents when --agent is unknown', async () => {
    const result = await setup({ argv: ['node', 'bin.js', '--agent', 'bogus'] })

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toMatch(/bogus/)
    expect(result.stderr).toMatch(/claude-code/)
  })

  it('fails closed: stdin read failures emit a vendor block response on stdout', async () => {
    const result = await setup({
      stdin: () => {
        throw new Error('input exceeds 10 bytes')
      },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toMatch(/exceeds|cap|bytes/i)
    const response = parseAs<ClaudeCodeResponse>(result.stdout ?? '')
    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(response.hookSpecificOutput.permissionDecisionReason).toMatch(
      /exceeds|cap|bytes/i,
    )
  })

  it('prints usage with --help including the repo URL and exits 0', async () => {
    const result = await setup({ argv: ['node', 'bin.js', '--help'] })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/Usage:/)
    expect(result.stdout).toContain('github.com/nizos/probity')
  })

  it('lists --config in the --help output', async () => {
    const result = await setup({ argv: ['node', 'bin.js', '--help'] })

    expect(result.stdout).toMatch(/--config/)
  })

  it('omits github-copilot-chat from the --help vendor list (not officially supported yet)', async () => {
    const result = await setup({ argv: ['node', 'bin.js', '--help'] })

    expect(result.stdout).not.toContain('github-copilot-chat')
  })

  it('prints the package version to stdout and exits 0 with --version', async () => {
    const result = await setup({ argv: ['node', 'bin.js', '--version'] })

    expect(result.exitCode).toBe(0)
    expect(result.stdout?.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('honors --config <path> by loading that file instead of discovering one', async () => {
    const result = await setup({
      argv: [
        'node',
        'bin.js',
        '--agent',
        'claude-code',
        '--config',
        'test/fixtures/configs/kebab-only.config.ts',
      ],
      stdin: KEBAB_PAYLOAD,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('forwards an injected config loader through to run()', async () => {
    const result = await setup({
      stdin: KEBAB_PAYLOAD,
      loadConfig: () => Promise.resolve(testConfig),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('fails closed when the config loader throws (a syntax error or a missing file becomes a vendor-shaped block)', async () => {
    const result = await setup({
      stdin: KEBAB_PAYLOAD,
      loadConfig: () => Promise.reject(new Error('config blew up')),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toMatch(/config blew up/)
    const response = parseAs<ClaudeCodeResponse>(result.stdout ?? '')
    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(response.hookSpecificOutput.permissionDecisionReason).toMatch(
      /config blew up/,
    )
  })

  it('writes the run() response to stdout and exits 0 on success', async () => {
    const result = await setup({
      stdin: KEBAB_PAYLOAD,
      loadConfig: () => Promise.resolve(testConfig),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBeUndefined()
    expect(result.stdout).toBe('')
  })

  it('appends each invocation to --debug <path> as a JSONL entry with datetime, request, and response', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'probity-debug-'))
    onTestFinished(() => rm(dir, { recursive: true, force: true }))
    const logPath = path.join(dir, 'probity.log')

    await setup({
      argv: ['node', 'bin.js', '--agent', 'claude-code', '--debug', logPath],
      stdin: KEBAB_PAYLOAD,
      loadConfig: () => Promise.resolve(testConfig),
    })

    const log = await readFile(logPath, 'utf8')
    const entries = log
      .trim()
      .split('\n')
      .map((line) =>
        parseAs<{ datetime: string; request: unknown; response: unknown }>(
          line,
        ),
      )
    expect(entries).toHaveLength(1)
    expect(entries[0]?.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(entries[0]).toMatchObject({
      request: { tool_name: 'Write' },
      response: '',
    })
  })
})

const stubAgent: Agent = {
  reason: () => Promise.resolve({ kind: 'pass', reason: '' }),
}

const testConfig: Config = {
  rules: [
    {
      files: ['**/src/**', '**/test/**'],
      rules: [enforceFilenameCasing({ style: 'kebab-case' })],
    },
  ],
  ai: stubAgent,
}

const KEBAB_PAYLOAD = readFileSync(
  'test/fixtures/claude-code/write-kebab-case.json',
  'utf8',
)

async function setup(
  opts: {
    argv?: readonly string[]
    stdin?: string | (() => string)
    loadConfig?: ConfigLoader
  } = {},
): Promise<MainResult> {
  return main({
    argv: opts.argv ?? ['node', 'bin.js', '--agent', 'claude-code'],
    stdin: opts.stdin ?? '',
    ...(opts.loadConfig && { loadConfig: opts.loadConfig }),
  })
}
