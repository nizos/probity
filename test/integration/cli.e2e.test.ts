import { readFileSync, symlinkSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PreToolUseHookOutput } from '@github/copilot/sdk'
import { describe, it, expect, onTestFinished } from 'vitest'

import type { Vendor } from '../../src/cli.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
import { runBin } from './helpers/run-bin.js'

const CONFIG_FIXTURE = 'test/fixtures/configs/kebab-only.config.ts'

describe('probity cli (integration)', () => {
  it('blocks a write that violates the configured rules', async () => {
    const { getResponse } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-new-file.json',
      config: CONFIG_FIXTURE,
    })

    expect(
      getResponse<ClaudeCodeResponse>().hookSpecificOutput.permissionDecision,
    ).toBe('deny')
  })

  it('emits no opinion (empty stdout) for a Bash payload that no rule blocks', async () => {
    const { getRawStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/bash-npm-install.json',
      config: CONFIG_FIXTURE,
    })

    expect(getRawStdout()).toBe('')
  })

  it('loads the config from --config <path> instead of discovering one', async () => {
    const { getRawStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-kebab-case.json',
      config: 'test/fixtures/configs/kebab-only.config.ts',
    })

    expect(getRawStdout()).toBe('')
  })

  it('blocks a write whose path matches a { files, rules } block scope', async () => {
    const { getResponse } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-new-file.json',
      config: 'test/fixtures/configs/blocks.config.ts',
    })

    expect(
      getResponse<ClaudeCodeResponse>().hookSpecificOutput.permissionDecision,
    ).toBe('deny')
  })

  it('skips a { files, rules } block when the write path is outside its files glob', async () => {
    const { getRawStdout } = await setup({
      payloadFixture: 'test/fixtures/claude-code/write-outside-src.json',
      config: 'test/fixtures/configs/blocks.config.ts',
    })

    expect(getRawStdout()).toBe('')
  })

  it.each([
    {
      vendor: 'claude-code' as const,
      fixture: 'test/fixtures/claude-code/write-new-file.json',
      readDeny: (out: string) =>
        parseAs<ClaudeCodeResponse>(out).hookSpecificOutput.permissionDecision,
      expected: 'deny',
    },
    {
      vendor: 'codex' as const,
      fixture: 'test/fixtures/codex/pre-apply-patch.json',
      readDeny: (out: string) => parseAs<CodexResponse>(out).decision,
      expected: 'block',
    },
    {
      vendor: 'github-copilot' as const,
      fixture: 'test/fixtures/github-copilot/pre-create-new-test.json',
      readDeny: (out: string) =>
        parseAs<PreToolUseHookOutput>(out).permissionDecision,
      expected: 'deny',
    },
    {
      vendor: 'github-copilot-chat' as const,
      fixture: 'test/fixtures/github-copilot-chat/pre-create-file.json',
      readDeny: (out: string) =>
        parseAs<ClaudeCodeResponse>(out).hookSpecificOutput.permissionDecision,
      expected: 'deny',
    },
  ])(
    'matches absolute paths from $vendor against `**/src/**` globs',
    async ({ vendor, fixture, readDeny, expected }) => {
      const { getStdout } = await setup({
        vendor,
        payloadFixture: fixture,
        config: 'test/fixtures/configs/relative-glob.config.ts',
      })

      expect(readDeny(getStdout())).toBe(expected)
    },
  )

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

    const response = parseAs<ClaudeCodeResponse>(result.stdout)
    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(response.hookSpecificOutput.permissionDecisionReason).toContain(
      'walk-up discovery fired',
    )
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

    const { getResponse } = await setup({
      payload: buildClaudeCodeWritePayload({ cwd: example, filePath }),
      config: configPath,
    })

    expect(
      getResponse<ClaudeCodeResponse>().hookSpecificOutput.permissionDecision,
    ).toBe('deny')
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

  const getResponse = <T>() => parseAs<T>(getStdout())

  return { getStdout, getRawStdout, getResponse }
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
