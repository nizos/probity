import { readFileSync, symlinkSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, onTestFinished } from 'vitest'

import type { Vendor } from '../../src/cli.js'
import { decodeResponse } from './helpers/decode-response.js'
import { runBin } from './helpers/run-bin.js'

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

  it('runs main() when invoked via a symlink (the npx case)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'probity-bin-link-'))
    onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true })
    })
    const link = path.join(dir, 'probity')
    symlinkSync(path.resolve('dist/bin.js'), link)

    const { getRawStdout } = await setup({
      binPath: link,
      args: ['--version'],
    })

    expect(getRawStdout().trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('discovers `probity.config.ts` via walk-up from process.cwd() when no --config is given, resolving `@nizos/probity` from outside the package tree', async () => {
    const projectRoot = await createScratchDir()
    const subdir = path.join(projectRoot, 'pkg-a')
    const filePath = path.join(subdir, 'src', 'foo.ts')
    await mkdir(path.dirname(filePath), { recursive: true })

    const configPath = path.join(projectRoot, 'probity.config.ts')
    await writeFile(
      configPath,
      `import { defineConfig, forbidContentPattern } from '@nizos/probity'

export default defineConfig({
  rules: [
    {
      files: ['**/src/**'],
      rules: [forbidContentPattern({ match: /./, reason: 'walk-up discovery fired' })],
    },
  ],
})
`,
    )

    const result = await runBin({
      args: ['--agent', 'claude-code'],
      cwd: subdir,
      payload: buildClaudeCodeWritePayload({ cwd: subdir, filePath }),
    })

    const decoded = decodeResponse('claude-code', result.stdout)
    expect(decoded.decision).toBe('deny')
    expect(decoded.reason).toContain('walk-up discovery fired')
  })

  it('matches a config rule scoped at the config root when the session opens in a subdirectory', async () => {
    const projectRoot = await createScratchDir()
    const example = path.join(projectRoot, 'example')
    const filePath = path.join(example, 'src', 'foo.ts')
    await mkdir(path.dirname(filePath), { recursive: true })

    const configPath = path.join(projectRoot, 'probity.config.ts')
    await writeFile(
      configPath,
      buildProbityConfig(`[{
        files: ['example/src/**'],
        rules: [forbidContentPattern({ match: /./, reason: 'edge-case rule fired' })],
      }]`),
    )

    const { getStdout } = await setup({
      payload: buildClaudeCodeWritePayload({ cwd: example, filePath }),
      config: configPath,
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

// Wraps a `defineConfig({...})` body in the boilerplate every test
// config needs (the import line + the default export). The argument is
// the rule entries — usually a `RuleEntry[]` literal as text.
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
  return JSON.stringify({
    session_id: 'edge-case',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: opts.filePath, content: 'x' },
    tool_use_id: 'tu_edge_case',
  })
}

async function createScratchDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'probity-e2e-'))
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return root
}
