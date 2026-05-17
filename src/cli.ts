import type { Action, Agent, Decision, RawSessionEvent } from './types.js'
import {
  findConfig,
  loadConfig,
  type Config,
  type RuleEntry,
} from './config.js'
import { evaluate } from './engine.js'
import { vendors, type Vendor, type VendorEntry } from './registry.js'
import { safeReadCapped } from './utils/safe-read.js'

const MAX_FILE_BYTES = 1024 * 1024

export type { Vendor } from './registry.js'

export type ConfigLoader = () => Promise<Config>

const defaultConfigLoader: ConfigLoader = () =>
  loadConfig(findConfig(process.cwd()))

export async function run(
  rawPayload: string,
  options: { vendor: Vendor; loadConfig?: ConfigLoader },
): Promise<string> {
  const entry = vendors[options.vendor]
  const config = await (options.loadConfig ?? defaultConfigLoader)()
  const agent = config.ai ?? entry.agent()
  return dispatch(entry, rawPayload, config.rules, agent)
}

async function dispatch(
  entry: VendorEntry,
  rawPayload: string,
  rules: readonly RuleEntry[],
  agent: Agent,
): Promise<string> {
  const parsed = await parsePayload(entry, rawPayload)
  if (parsed.kind === 'invalid') {
    return entry.adapter.toResponse(parsed.decision)
  }
  const rawHistory = parsed.rawHistory
  const toCanonical = entry.toCanonical
  const history =
    rawHistory && toCanonical
      ? async () => (await rawHistory()).map(toCanonical)
      : undefined
  const decision = await evaluate(parsed.action, rules, {
    agent,
    ...(rawHistory && { rawHistory }),
    ...(history && { history }),
    readFile: (path) => safeReadCapped(path, { maxBytes: MAX_FILE_BYTES }),
  })
  return entry.adapter.toResponse(decision)
}

type ParseResult =
  | {
      kind: 'ok'
      action: Action
      rawHistory: (() => Promise<RawSessionEvent[]>) | undefined
    }
  | { kind: 'invalid'; decision: Decision }

async function parsePayload(
  entry: VendorEntry,
  rawPayload: string,
): Promise<ParseResult> {
  let json: unknown
  try {
    json = JSON.parse(rawPayload)
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error))
  }

  const action = await entry.adapter.parseAction(json)
  if (!action.ok) return invalid(action.reason)

  const sessionPath = entry.adapter.sessionPath?.(json)
  return {
    kind: 'ok',
    action: action.action,
    rawHistory: sessionPath
      ? () => entry.readTranscript(sessionPath)
      : undefined,
  }
}

function invalid(reason: string): ParseResult {
  return {
    kind: 'invalid',
    decision: { kind: 'block', reason: `invalid hook payload: ${reason}` },
  }
}
