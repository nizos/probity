import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import type { Vendor } from '../../src/cli.js'
import { decodeResponse } from '../helpers/decode-response.js'
import { runBin } from '../helpers/run-bin.js'
import { createSandbox } from '../helpers/sandbox.js'
import { createWriteAction } from '../helpers/write-actions.js'

const CONFIG_FIXTURE = 'test/fixtures/configs/kebab-only.config.ts'

describe('probity cli (integration)', () => {
  it('blocks a write that violates the configured rules', async () => {
    const { getStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-new-file.json',
      config: CONFIG_FIXTURE,
    })

    expect(decodeResponse('claude-code', getStdout()).decision).toBe('deny')
  })

  it('emits no opinion for a Bash payload that no rule blocks', async () => {
    const { getRawStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/bash-npm-install.json',
      config: CONFIG_FIXTURE,
    })

    expect(decodeResponse('claude-code', getRawStdout()).decision).toBe('allow')
  })

  it('loads the config from --config <path> instead of discovering one', async () => {
    const { getRawStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-kebab-case.json',
      config: 'test/fixtures/configs/kebab-only.config.ts',
    })

    expect(decodeResponse('claude-code', getRawStdout()).decision).toBe('allow')
  })

  it('blocks a write whose path matches a { files, rules } block scope', async () => {
    const { getStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-new-file.json',
      config: 'test/fixtures/configs/blocks.config.ts',
    })

    expect(decodeResponse('claude-code', getStdout()).decision).toBe('deny')
  })

  it('runs main() when invoked via a symlink', async () => {
    const sandbox = await createSandbox({
      probity: (api) => api.symlink(path.resolve('dist/bin.js')),
    })

    const { getRawStdout } = await setup({
      binPath: sandbox.getPath('probity'),
      args: ['--version'],
    })

    expect(getRawStdout().trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('discovers `probity.config.ts` via walk-up from process.cwd() when no --config is given, resolving `@nizos/probity` from outside the package tree', async () => {
    const sandbox = await createSandbox({
      'pkg-a/src/foo.ts': '',
      'probity.config.ts': `import { defineConfig, forbidContentPattern } from '@nizos/probity'

export default defineConfig({
  rules: [
    {
      files: ['**/src/**'],
      rules: [forbidContentPattern({ match: /./, reason: 'walk-up discovery fired' })],
    },
  ],
})
`,
    })
    const subdir = sandbox.getPath('pkg-a')
    const filePath = sandbox.getPath('pkg-a/src/foo.ts')

    const result = await runBin({
      args: ['--agent', 'claude-code'],
      cwd: subdir,
      payload: buildClaudeCodeWritePayload({ cwd: subdir, filePath }),
    })

    const decoded = decodeResponse('claude-code', result.stdout)
    expect(decoded.decision).toBe('deny')
    expect(decoded.reason).toContain('walk-up discovery fired')
  })

  it('writes a --debug JSONL entry whose trace includes the rule-evaluated entry the engine produced', async () => {
    const sandbox = await createSandbox({})
    const logPath = sandbox.getPath('probity.log')

    await runBin({
      args: [
        '--agent',
        'claude-code',
        '--config',
        CONFIG_FIXTURE,
        '--debug',
        logPath,
      ],
      payload: readFileSync(
        'test/fixtures/claude-code/write-kebab-case.json',
        'utf8',
      ),
    })

    const log = await readFile(logPath, 'utf8')
    const entry = JSON.parse(log.trim()) as {
      datetime: string
      trace: { kind: string; rule?: string; result?: { kind: string } }[]
    }

    expect(entry.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(entry.trace).toHaveLength(1)
    expect(entry.trace[0]).toMatchObject({
      kind: 'rule-evaluated',
      rule: 'enforceFilenameCasing',
      result: { kind: 'pass' },
    })
  })

  it('matches a config rule scoped at the config root when the session opens in a subdirectory', async () => {
    const sandbox = await createSandbox({
      'example/src/foo.ts': '',
      'probity.config.ts': buildProbityConfig(`[{
        files: ['example/src/**'],
        rules: [forbidContentPattern({ match: /./, reason: 'edge-case rule fired' })],
      }]`),
    })
    const example = sandbox.getPath('example')
    const filePath = sandbox.getPath('example/src/foo.ts')

    const { getStdout } = await setup({
      payload: buildClaudeCodeWritePayload({ cwd: example, filePath }),
      config: sandbox.getPath('probity.config.ts'),
    })

    expect(decodeResponse('claude-code', getStdout()).decision).toBe('deny')
  })
})

type SetupOptions = {
  binPath?: string
  args?: readonly string[]
  payloadFixture?: string
  payload?: string
  config?: string
  vendor?: Vendor
}

async function setup(options: SetupOptions = {}) {
  const result = await runBin({
    ...(options.binPath !== undefined && { binPath: options.binPath }),
    args: options.args ?? buildAgentArgs(options),
    payload: resolvePayload(options),
  })

  const getStdout = () => {
    if (!result.stdout) {
      throw new Error(
        `expected cli to emit a response; stdout was empty. stderr: ${result.stderr}`,
      )
    }
    return result.stdout
  }

  const getRawStdout = () => result.stdout

  return { getStdout, getRawStdout }
}

function buildAgentArgs(options: SetupOptions): string[] {
  const args = ['--agent', options.vendor ?? 'claude-code']
  if (options.config) args.push('--config', options.config)
  return args
}

function resolvePayload(options: SetupOptions): string {
  if (options.payload !== undefined) return options.payload
  if (options.payloadFixture)
    return readFileSync(options.payloadFixture, 'utf8')
  return ''
}

/**
 * Wraps a `defineConfig({...})` body in the boilerplate every test
 * config needs (the import line + the default export). The argument
 * is the rule entries, usually a `RuleEntry[]` literal as text.
 */
function buildProbityConfig(rules: string): string {
  const dist = path.resolve('dist/index.js')
  return `import { defineConfig, enforceFilenameCasing, enforceTdd, forbidCommandPattern, forbidContentPattern } from '${dist}'

export default defineConfig({ rules: ${rules} })
`
}

function buildClaudeCodeWritePayload(opts: {
  cwd: string
  filePath: string
}): string {
  return JSON.stringify(
    createWriteAction({
      agent: 'claude-code',
      cwd: opts.cwd,
      filePath: opts.filePath,
      content: 'x',
    }),
  )
}
