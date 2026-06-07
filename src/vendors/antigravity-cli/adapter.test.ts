import { describe, expect, it } from 'vitest'

import { createSandbox } from '../../../test/helpers/sandbox.js'
import type { Decision } from '../../types.js'
import { parseAction, sessionPath, toResponse } from './adapter.js'

describe('antigravity-cli adapter', () => {
  it('maps run_command to a command action', async () => {
    const result = await parseAction({
      hook_event_name: 'BeforeTool',
      tool_name: 'run_command',
      tool_input: { CommandLine: 'npm test', Cwd: '/work' },
      cwd: '/work',
    })
    expect(result).toEqual({
      ok: true,
      action: { kind: 'command', command: 'npm test' },
    })
  })

  it('maps write_to_file to a write action with an absolute POSIX path', async () => {
    const result = await parseAction({
      tool_name: 'write_to_file',
      tool_input: { TargetFile: 'src/note.txt', CodeContent: 'hello' },
      cwd: '/work',
    })
    expect(result).toEqual({
      ok: true,
      action: { kind: 'write', path: '/work/src/note.txt', content: 'hello' },
    })
  })

  it('maps replace_file_content to a write of the full post-edit content', async () => {
    const sandbox = await createSandbox({
      'calc.py': 'def answer():\n    return 1\n',
    })
    const file = sandbox.getPath('calc.py')
    const result = await parseAction({
      tool_name: 'replace_file_content',
      tool_input: {
        TargetFile: file,
        TargetContent: '    return 1',
        ReplacementContent: '    return 2',
      },
      cwd: sandbox.path,
    })
    expect(result).toEqual({
      ok: true,
      action: {
        kind: 'write',
        path: file.replace(/\\/g, '/'),
        content: 'def answer():\n    return 2\n',
      },
    })
  })

  it('passes unmodeled tools through as a no-op command', async () => {
    const result = await parseAction({
      tool_name: 'grep_search',
      tool_input: { Query: 'answer', SearchPath: '/work' },
    })
    expect(result).toEqual({
      ok: true,
      action: { kind: 'command', command: '' },
    })
  })

  it('resolves the session path from transcript_path', () => {
    expect(
      sessionPath({
        tool_name: 'run_command',
        transcript_path: '/home/user/.gemini/logs/transcript.jsonl',
      }),
    ).toBe('/home/user/.gemini/logs/transcript.jsonl')
  })

  it('formats a block decision as Antigravity expects', () => {
    const decision: Decision = { kind: 'block', reason: 'write a test first' }
    expect(JSON.parse(toResponse(decision))).toEqual({
      decision: 'block',
      reason: 'write a test first',
    })
  })
})
