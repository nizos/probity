import { describe, it, expect } from 'vitest'
import { toCanonical } from './event.js'

describe('gemini-cli event classification', () => {
  it('maps run_shell_command to command event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'run_shell_command',
      input: { command: 'ls' },
      output: 'file.txt',
      toolUseId: 'id1',
    })
    expect(canonical).toEqual({
      kind: 'command',
      command: 'ls',
      output: 'file.txt',
    })
  })

  it('maps write_file to write event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'write_file',
      input: { file_path: 'foo.txt', content: 'hello' },
      output: 'ok',
      toolUseId: 'id2',
    })
    expect(canonical).toEqual({
      kind: 'write',
      path: 'foo.txt',
      content: 'hello',
      output: 'ok',
    })
  })

  it('maps replace to write event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'replace',
      input: { file_path: 'foo.txt', new_string: 'world' },
      output: 'ok',
      toolUseId: 'id3',
    })
    expect(canonical).toEqual({
      kind: 'write',
      path: 'foo.txt',
      content: 'world',
      output: 'ok',
    })
  })

  it('maps other tools to other event', () => {
    const canonical = toCanonical({
      kind: 'action',
      tool: 'list_directory',
      input: { dir_path: '.' },
      output: '...',
      toolUseId: 'id4',
    })
    expect(canonical).toEqual({
      kind: 'other',
      tool: 'list_directory',
      input: { dir_path: '.' },
      output: '...',
    })
  })
})
