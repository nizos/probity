import type { FileTree } from 'fs-fixture'
import { describe, it, expect } from 'vitest'

import type { Vendor } from '../../src/cli.js'
import {
  decodeResponse,
  type DecodedResponse,
} from '../helpers/decode-response.js'
import { runBin } from '../helpers/run-bin.js'
import { createSandbox } from '../helpers/sandbox.js'
import { createWriteAction } from '../helpers/write-actions.js'

const CONSOLE_LOG_CONTENT = "console.log('fetch failed', err)"
const CONSOLE_RULE_REASON = 'No console.* in TypeScript source'
const DEFAULT_GLOB = 'src/**/*.ts'

describe.each([
  'claude-code',
  'codex',
  'github-copilot-chat',
  'github-copilot',
] as const)('probity scenarios — %s', (agent) => {
  describe('writes', () => {
    const defaults = {
      glob: DEFAULT_GLOB,
      agentCwdAt: '.',
    }

    const blockingScenarios: Scenario[] = [
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

    const allowingScenarios: Scenario[] = [
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
      {
        // File is entirely outside the glob's directory tree (no `src/` anywhere in the path).
        ...defaults,
        glob: '**/src/**/*.ts',
        description:
          "allows a write whose path is entirely outside the glob's directory tree",
        filePath: 'scripts/foo.ts',
      },
    ]

    const fixtureFiles: FileTree = {
      'src/foo.ts': '',
      'src/foo.js': '',
      'repoA/src/foo.ts': '',
      'repoA/src/foo.js': '',
      'scripts/foo.ts': '',
    }

    async function runScenario(scenario: Scenario): Promise<DecodedResponse> {
      const sandbox = await createSandbox({
        'probity.config.ts': createProbityConfig({ glob: scenario.glob }),
        ...fixtureFiles,
      })
      return runWriteAction({
        agent,
        cwd: sandbox.getPath(scenario.agentCwdAt),
        filePath: scenario.filePath,
      })
    }

    it.each(blockingScenarios)('$description', async (scenario) => {
      const result = await runScenario(scenario)
      expect(result.decision).toBe('deny')
      expect(result.reason).toContain(CONSOLE_RULE_REASON)
    })

    it.each(allowingScenarios)('$description', async (scenario) => {
      const result = await runScenario(scenario)
      expect(result.decision).toBe('allow')
    })

    // Absolute path (rest of the matrix uses relative paths).
    it.each([
      { name: 'anchored', glob: DEFAULT_GLOB },
      { name: 'match-anywhere', glob: '**/src/**/*.ts' },
    ])(
      'blocks a forbidden write when the payload uses an absolute POSIX file_path ($name glob)',
      async ({ glob }) => {
        const sandbox = await createSandbox({
          'probity.config.ts': createProbityConfig({ glob }),
          ...fixtureFiles,
        })
        const result = await runWriteAction({
          agent,
          cwd: sandbox.path,
          filePath: sandbox.getPath('src/foo.ts'),
        })
        expect(result.decision).toBe('deny')
        expect(result.reason).toContain(CONSOLE_RULE_REASON)
      },
    )
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
    }): Promise<DecodedResponse> {
      const sandbox = await createSandbox({
        'probity.config.ts': createProbityConfig(),
        ...extraFiles,
        'src/foo.ts': '',
        'src/foo.js': '',
      })
      return runWriteAction({
        agent: 'claude-code',
        cwd: sandbox.path,
        filePath: scenario.filePath,
      })
    }

    it.each(blockingScenarios)('$description', async (scenario) => {
      const result = await runScenario(scenario)
      expect(result.decision).toBe('deny')
      expect(result.reason).toContain(CONSOLE_RULE_REASON)
    })

    it.each(allowingScenarios)('$description', async (scenario) => {
      const result = await runScenario(scenario)
      expect(result.decision).toBe('allow')
    })
  })
})

type Scenario = {
  glob: string
  agentCwdAt: string
  description: string
  filePath: string
}

function createProbityConfig(
  opts: { rules?: string; glob?: string } = {},
): string {
  const glob = opts.glob ?? DEFAULT_GLOB
  const rules =
    opts.rules ??
    `[
    {
      files: ['${glob}'],
      rules: [forbidContentPattern({ match: 'console', reason: '${CONSOLE_RULE_REASON}' })],
    },
  ]`
  return `import { defineConfig, forbidContentPattern, forbidCommandPattern, enforceTdd, enforceFilenameCasing, requireCommand } from '@nizos/probity'
export default defineConfig({ rules: ${rules} })
`
}

/**
 * Stamps out a write action for `agent`, fires the bin against `cwd`,
 * and returns the decoded response. The fixture and config setup is the
 * caller's responsibility — this is just the action-and-spawn core.
 */
async function runWriteAction(opts: {
  agent: Vendor
  cwd: string
  filePath: string
}): Promise<DecodedResponse> {
  const action = createWriteAction({
    agent: opts.agent,
    cwd: opts.cwd,
    filePath: opts.filePath,
    content: CONSOLE_LOG_CONTENT,
  })
  const { stdout } = await runBin({
    args: ['--agent', opts.agent],
    payload: JSON.stringify(action),
    cwd: opts.cwd,
  })
  return decodeResponse(opts.agent, stdout)
}
