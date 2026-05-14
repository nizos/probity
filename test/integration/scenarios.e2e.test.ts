import { spawn } from 'node:child_process'
import path from 'node:path'

import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'
import type { FileWriteInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools'
import { createFixture, type FileTree } from 'fs-fixture'
import { describe, it, expect, onTestFinished } from 'vitest'

import type { Vendor } from '../../src/cli.js'
import { parseAs } from '../../src/utils/parse-as.js'
import type { ResponseShape as ClaudeCodeResponse } from '../../src/vendors/claude-code/adapter.js'
import type { ResponseShape as CodexResponse } from '../../src/vendors/codex/adapter.js'
import type { ResponseShape as CopilotResponse } from '../../src/vendors/github-copilot/adapter.js'

describe.each([
  'claude-code',
  'codex',
  'github-copilot-chat',
  'github-copilot',
] as const)('probity scenarios — %s', (agent) => {
  describe('writes', () => {
    const defaults = {
      glob: 'src/**/*.ts',
      agentCwdAt: '.',
    }

    const blockingScenarios = [
      {
        // src/foo.ts at the config root matches anchored src/**/*.ts
        ...defaults,
        description:
          'blocks a forbidden write when the glob anchors at the config root',
        filePath: 'src/foo.ts',
      },
      {
        // Match-anywhere glob reaches a .ts file deep in the tree
        ...defaults,
        glob: '**/src/**/*.ts',
        description:
          'blocks a forbidden write when the glob matches anywhere in the tree',
        filePath: 'src/nested/foo.ts',
      },
      {
        // Agent cwd is repoA; probity walks up to find the config at fixture root
        ...defaults,
        glob: '**/src/**/*.ts',
        agentCwdAt: 'repoA',
        description:
          'blocks a forbidden write in a sub-repo when the config is in a parent directory',
        filePath: 'src/foo.ts',
      },
      {
        // Backslash file_path; probity normalizes to POSIX before glob match
        ...defaults,
        description:
          'blocks a forbidden write when the payload uses Windows-shape paths',
        filePath: 'src\\foo.ts',
      },
      {
        // Sub-repo cwd + parent config + Windows-shape file_path together
        ...defaults,
        glob: '**/src/**/*.ts',
        agentCwdAt: 'repoA',
        description:
          'blocks a forbidden write in a sub-repo when both Windows-shape paths and parent-dir config apply',
        filePath: 'src\\foo.ts',
      },
    ]

    const allowingScenarios = [
      {
        // src/foo.js: extension is outside the .ts-only glob
        ...defaults,
        description:
          'allows a legal write when the file extension is outside the glob',
        filePath: 'src/foo.js',
      },
      {
        // Match-anywhere glob is still .ts-only; .js at depth is excluded
        ...defaults,
        glob: '**/src/**/*.ts',
        description:
          'allows a legal write deep in the tree when the file extension is outside the glob',
        filePath: 'src/nested/foo.js',
      },
      {
        // Sub-repo write of a .js file under a parent-dir config
        ...defaults,
        glob: '**/src/**/*.ts',
        agentCwdAt: 'repoA',
        description:
          'allows a legal write in a sub-repo when the file extension is outside the glob',
        filePath: 'src/foo.js',
      },
      {
        // Windows-shape file_path with .js extension excluded
        ...defaults,
        description:
          'allows a legal write when the Windows-shape file extension is outside the glob',
        filePath: 'src\\foo.js',
      },
      {
        // Sub-repo + parent config + Windows-shape + extension excluded
        ...defaults,
        glob: '**/src/**/*.ts',
        agentCwdAt: 'repoA',
        description:
          'allows a legal write in a sub-repo when Windows-shape paths and parent-dir config apply and the file extension is outside the glob',
        filePath: 'src\\foo.js',
      },
    ]

    const fixtureFiles: FileTree = {
      'src/foo.ts': '',
      'src/foo.js': '',
      'repoA/src/foo.ts': '',
      'repoA/src/foo.js': '',
    }

    async function runScenario(scenario: {
      glob: string
      agentCwdAt: string
      filePath: string
    }): Promise<string> {
      const fixture = await createScenarioFixture({
        files: {
          'probity.config.ts': createProbityConfig({ glob: scenario.glob }),
          ...fixtureFiles,
        },
      })
      const agentCwd = fixture.getPath(scenario.agentCwdAt)
      const action = createWriteAction({
        agent,
        cwd: agentCwd,
        filePath: scenario.filePath,
        content: "console.log('fetch failed', err)",
      })
      const { stdout } = await runHook({
        agent,
        payload: JSON.stringify(action),
        cwd: agentCwd,
      })
      return stdout
    }

    it.each(blockingScenarios)('$description', async (scenario) => {
      const stdout = await runScenario(scenario)
      expectBlocked(agent, stdout, 'No console.* in TypeScript source')
    })

    it.each(allowingScenarios)('$description', async (scenario) => {
      const stdout = await runScenario(scenario)
      expect(stdout).toBe('')
    })

    it('blocks a forbidden write when the payload uses an absolute POSIX file_path', async () => {
      // Absolute path (rest of the matrix uses relative paths)
      const fixture = await createScenarioFixture({
        files: {
          'probity.config.ts': createProbityConfig(),
          ...fixtureFiles,
        },
      })
      const action = createWriteAction({
        agent,
        cwd: fixture.path,
        filePath: fixture.getPath('src/foo.ts'),
        content: "console.log('fetch failed', err)",
      })
      const { stdout } = await runHook({
        agent,
        payload: JSON.stringify(action),
        cwd: fixture.path,
      })

      expectBlocked(agent, stdout, 'No console.* in TypeScript source')
    })
  })
})

describe('install modes (claude-code)', () => {
  const installSetups: { name: string; extraFiles: FileTree }[] = [
    {
      name: 'with local node_modules symlink',
      extraFiles: {
        'node_modules/@nizos/probity': (api) => api.symlink(process.cwd()),
      },
    },
    {
      name: 'with no local node_modules',
      extraFiles: {},
    },
  ]

  const blockingScenarios = [
    {
      // src/foo.ts matches the rule's .ts-only glob
      description: 'blocks a forbidden write',
      filePath: 'src/foo.ts',
    },
  ]

  const allowingScenarios = [
    {
      // src/foo.js is outside the .ts-only glob
      description:
        'allows a legal write when the file extension is outside the glob',
      filePath: 'src/foo.js',
    },
  ]

  describe.each(installSetups)('$name', ({ extraFiles }) => {
    async function runScenario(scenario: {
      filePath: string
    }): Promise<string> {
      const fixture = await createScenarioFixture({
        files: {
          'probity.config.ts': createProbityConfig(),
          ...extraFiles,
          'src/foo.ts': '',
          'src/foo.js': '',
        },
      })
      const action = createWriteAction({
        agent: 'claude-code',
        cwd: fixture.path,
        filePath: scenario.filePath,
        content: "console.log('fetch failed', err)",
      })
      const { stdout } = await runHook({
        agent: 'claude-code',
        payload: JSON.stringify(action),
        cwd: fixture.path,
      })
      return stdout
    }

    it.each(blockingScenarios)('$description', async (scenario) => {
      const stdout = await runScenario(scenario)
      expectBlocked('claude-code', stdout, 'No console.* in TypeScript source')
    })

    it.each(allowingScenarios)('$description', async (scenario) => {
      const stdout = await runScenario(scenario)
      expect(stdout).toBe('')
    })
  })
})

function createProbityConfig(
  opts: { rules?: string; glob?: string } = {},
): string {
  const glob = opts.glob ?? 'src/**/*.ts'
  const rules =
    opts.rules ??
    `[
    {
      files: ['${glob}'],
      rules: [forbidContentPattern({ match: 'console', reason: 'No console.* in TypeScript source' })],
    },
  ]`
  return `import { defineConfig, forbidContentPattern, forbidCommandPattern, enforceTdd, enforceFilenameCasing, requireCommand } from '@nizos/probity'
export default defineConfig({ rules: ${rules} })
`
}

async function createScenarioFixture(opts: { files: FileTree }) {
  const fixture = await createFixture(opts.files)
  onTestFinished(async () => fixture.rm())
  return fixture
}

async function runHook(opts: {
  agent: Vendor
  payload: string
  cwd: string
}): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(
    process.execPath,
    [path.resolve('dist/bin.js'), '--agent', opts.agent],
    { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
  child.stdin.end(opts.payload)
  await new Promise<void>((resolve, reject) => {
    child.on('close', () => resolve())
    child.on('error', reject)
  })
  return {
    stdout: Buffer.concat(stdoutChunks).toString(),
    stderr: Buffer.concat(stderrChunks).toString(),
  }
}

function createWriteAction(opts: {
  agent: Vendor
  cwd: string
  filePath: string
  content: string
}): unknown {
  switch (opts.agent) {
    case 'claude-code':
      return createClaudeCodeWriteAction(opts)
    case 'codex':
      return createCodexWriteAction(opts)
    case 'github-copilot-chat':
      return createCopilotChatWriteAction(opts)
    case 'github-copilot':
      return createCopilotWriteAction(opts)
  }
}

type ClaudeCodeWriteAction = Omit<
  PreToolUseHookInput,
  'tool_name' | 'tool_input'
> & {
  tool_name: 'Write'
  tool_input: FileWriteInput
}

function createClaudeCodeWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): ClaudeCodeWriteAction {
  return {
    session_id: 'scenario',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_use_id: 'tu_scenario',
    tool_input: { file_path: opts.filePath, content: opts.content },
  }
}

type CodexWriteAction = {
  session_id: string
  turn_id: string
  transcript_path: string
  cwd: string
  hook_event_name: 'PreToolUse'
  model: string
  permission_mode: string
  tool_name: 'apply_patch'
  tool_input: { command: string }
  tool_use_id: string
}

function createCodexWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CodexWriteAction {
  return {
    session_id: 'scenario',
    turn_id: 'turn-scenario',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: opts.cwd,
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.5',
    permission_mode: 'default',
    tool_name: 'apply_patch',
    tool_input: {
      command: `*** Begin Patch\n*** Add File: ${opts.filePath}\n+${opts.content}\n*** End Patch\n`,
    },
    tool_use_id: 'tu_scenario',
  }
}

type CopilotChatWriteAction = {
  timestamp: string
  hook_event_name: 'PreToolUse'
  session_id: string
  transcript_path: string
  tool_name: 'create_file'
  tool_input: { filePath: string; content: string }
  tool_use_id: string
  cwd: string
}

function createCopilotChatWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CopilotChatWriteAction {
  return {
    timestamp: '2026-05-13T00:00:00.000Z',
    hook_event_name: 'PreToolUse',
    session_id: 'scenario',
    transcript_path: '/tmp/transcript.jsonl',
    tool_name: 'create_file',
    tool_input: { filePath: opts.filePath, content: opts.content },
    tool_use_id: 'tu_scenario',
    cwd: opts.cwd,
  }
}

type CopilotWriteAction = {
  sessionId: string
  timestamp: number
  cwd: string
  toolName: 'create'
  toolArgs: string
}

function createCopilotWriteAction(opts: {
  cwd: string
  filePath: string
  content: string
}): CopilotWriteAction {
  return {
    sessionId: 'scenario',
    timestamp: 0,
    cwd: opts.cwd,
    toolName: 'create',
    toolArgs: JSON.stringify({
      path: opts.filePath,
      file_text: opts.content,
    }),
  }
}

function expectBlocked(
  agent: Vendor,
  stdout: string,
  reasonMatch: string,
): void {
  if (agent === 'claude-code' || agent === 'github-copilot-chat') {
    const response = parseAs<ClaudeCodeResponse>(stdout)
    expect(response.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(response.hookSpecificOutput.permissionDecisionReason).toContain(
      reasonMatch,
    )
  } else if (agent === 'codex') {
    const response = parseAs<CodexResponse>(stdout)
    expect(response.decision).toBe('block')
    expect(response.reason).toContain(reasonMatch)
  } else if (agent === 'github-copilot') {
    const response = parseAs<CopilotResponse>(stdout)
    expect(response.permissionDecision).toBe('deny')
    expect(response.permissionDecisionReason).toContain(reasonMatch)
  }
}
