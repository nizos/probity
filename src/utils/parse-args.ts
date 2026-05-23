import { isVendor, vendors, type Vendor } from '../registry.js'

export type ParsedArgs =
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'error'; stderr: string; exitCode: number }
  | {
      kind: 'run'
      vendor: Vendor
      configPath: string | undefined
      debugLogPath: string | undefined
    }

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.includes('--version')) return { kind: 'version' }
  if (argv.includes('--help')) return { kind: 'help' }
  const agent = requireAgent(argv)
  if (agent.kind === 'error') return agent
  const configPath = pathFlag(argv, '--config')
  if (configPath.kind === 'error') return configPath
  const debugLogPath = pathFlag(argv, '--debug')
  if (debugLogPath.kind === 'error') return debugLogPath
  return {
    kind: 'run',
    vendor: agent.value,
    configPath: configPath.value,
    debugLogPath: debugLogPath.value,
  }
}

type Result<T> =
  | { kind: 'ok'; value: T }
  | Extract<ParsedArgs, { kind: 'error' }>

function requireAgent(argv: readonly string[]): Result<Vendor> {
  const idx = argv.indexOf('--agent')
  if (idx === -1) {
    return {
      kind: 'error',
      stderr: 'Probity: --agent is missing\n',
      exitCode: 2,
    }
  }
  const value = argv[idx + 1]
  if (!isVendor(value)) {
    const known = Object.keys(vendors).join(', ')
    return {
      kind: 'error',
      stderr: `Probity: --agent ${String(value)} is not a known agent. Expected one of: ${known}\n`,
      exitCode: 2,
    }
  }
  return { kind: 'ok', value }
}

function pathFlag(
  argv: readonly string[],
  flag: string,
): Result<string | undefined> {
  const idx = argv.indexOf(flag)
  if (idx === -1) return { kind: 'ok', value: undefined }
  const next = argv[idx + 1]
  if (next === undefined || next.startsWith('--')) {
    return {
      kind: 'error',
      stderr: `Probity: ${flag} is missing its path\n`,
      exitCode: 2,
    }
  }
  return { kind: 'ok', value: next }
}
