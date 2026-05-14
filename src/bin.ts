#!/usr/bin/env node
import { readFileSync, readSync, realpathSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { vendors, type Vendor } from './registry.js'
import { run, type ConfigLoader } from './cli.js'
import { loadConfig } from './config.js'
import { parseArgs, type ParsedArgs } from './utils/parse-args.js'
import { readCapped } from './utils/read-capped.js'

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

const PACKAGE_JSON = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    ),
    'utf8',
  ),
) as { version: string; description?: string; homepage?: string }

const VERSION = PACKAGE_JSON.version

const HELP = `probity ${VERSION}
${PACKAGE_JSON.description ?? 'Process discipline for coding agents.'}

Usage:
  probity --agent <vendor> < <hook-payload-json>

Reads a hook payload from stdin, dispatches it through the rules
configured in probity.config.ts, and writes the vendor's response
format to stdout.

Vendors:
  ${Object.keys(vendors).join(', ')}

Options:
  --agent <vendor>  Required. The host coding agent.
  --config <path>   Load rules from <path> instead of auto-discovering
                    probity.config.ts.
  --debug <path>    Append each invocation's hook payload and response
                    to <path> for diagnostics.
  --version         Print the package version and exit.
  --help            Print this help and exit.

Repo: ${PACKAGE_JSON.homepage ?? 'https://github.com/nizos/probity'}
`

export type MainResult = {
  stdout?: string
  stderr?: string
  exitCode: number
}

type MainArgs = {
  argv: readonly string[]
  stdin: string | (() => string)
  loadConfig?: ConfigLoader
}

type RunArgs = Extract<ParsedArgs, { kind: 'run' }>

export async function main(args: MainArgs): Promise<MainResult> {
  const parsed = parseArgs(args.argv)
  if (parsed.kind === 'version') return { stdout: `${VERSION}\n`, exitCode: 0 }
  if (parsed.kind === 'help') return { stdout: HELP, exitCode: 0 }
  if (parsed.kind === 'error') {
    return { stderr: parsed.stderr, exitCode: parsed.exitCode }
  }
  return runWithDiagnostics(parsed, args)
}

async function runWithDiagnostics(
  parsed: RunArgs,
  args: MainArgs,
): Promise<MainResult> {
  const { stdin, result } = await runOrFailClosed(parsed, args)
  await logExchange(parsed.debugLogPath, stdin, result.stdout)
  return result
}

/**
 * Returns the stdin alongside the result so the diagnostic logger can
 * see both even when stdin resolution itself was the failure.
 */
async function runOrFailClosed(
  parsed: RunArgs,
  args: MainArgs,
): Promise<{ stdin: string; result: MainResult }> {
  try {
    const stdin = resolveStdin(args.stdin)
    const loaderOverride = args.loadConfig ?? loaderFromPath(parsed.configPath)
    const response = await run(stdin, {
      vendor: parsed.vendor,
      ...(loaderOverride && { loadConfig: loaderOverride }),
    })
    return { stdin, result: { stdout: response, exitCode: 0 } }
  } catch (error) {
    return { stdin: '', result: failClosed(parsed.vendor, error) }
  }
}

function resolveStdin(stdin: string | (() => string)): string {
  return typeof stdin === 'function' ? stdin() : stdin
}

/**
 * Most agents treat a non-zero exit as advisory and would let the
 * action through; we emit a vendor-shaped block on stdout instead.
 */
function failClosed(vendor: Vendor, error: unknown): MainResult {
  const reason = error instanceof Error ? error.message : String(error)
  const block = vendors[vendor].adapter.toResponse({
    kind: 'block',
    reason: `probity: ${reason}`,
  })
  return { stdout: block, stderr: `probity: ${reason}\n`, exitCode: 0 }
}

async function logExchange(
  logPath: string | undefined,
  request: string,
  response: string | undefined,
): Promise<void> {
  if (!logPath || response === undefined) return
  const entry =
    JSON.stringify({
      datetime: new Date().toISOString(),
      request: tryJsonParse(request),
      response: tryJsonParse(response),
    }) + '\n'
  await appendFile(logPath, entry, 'utf8').catch(() => undefined)
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function loaderFromPath(
  configPath: string | undefined,
): ConfigLoader | undefined {
  return configPath !== undefined
    ? () => loadConfig(path.resolve(configPath))
    : undefined
}

/**
 * argv[1] is a shim path under npx / node_modules/.bin; resolve the
 * symlink before comparing or main() never runs.
 */
function isInvokedAsScript(): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    const resolved = realpathSync(argv1)
    return import.meta.url === pathToFileURL(resolved).href
  } catch {
    return false
  }
}

if (isInvokedAsScript()) {
  const result = await main({
    argv: process.argv,
    stdin: () =>
      readCapped(
        (buffer, offset, length) => readSync(0, buffer, offset, length, null),
        MAX_PAYLOAD_BYTES,
      ),
  })
  if (result.stdout !== undefined) process.stdout.write(result.stdout)
  if (result.stderr !== undefined) process.stderr.write(result.stderr)
  process.exit(result.exitCode)
}
