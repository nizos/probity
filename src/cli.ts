import type {
  Action,
  Agent,
  Decision,
  RawSessionEvent,
  TraceEntry,
} from './types.js'
import { createAgentCallCollector } from './agent-call-collector.js'
import {
  findConfig,
  loadConfig,
  type Config,
  type RuleEntry,
} from './config.js'
import { evaluate } from './engine.js'
import { vendors, type Vendor, type VendorEntry } from './registry.js'
import type { RuleContext } from './rules/contract.js'
import { safeReadCapped } from './utils/safe-read.js'

const MAX_FILE_BYTES = 1024 * 1024

export type { Vendor } from './registry.js'

export type ConfigLoader = () => Promise<Config>

/**
 * The cli's projection of an engine outcome onto its two audiences:
 * `response` for the host agent, `trace` for the operator log.
 */
export type RunResult = {
  response: string
  trace: readonly TraceEntry[]
}

const defaultConfigLoader: ConfigLoader = () =>
  loadConfig(findConfig(process.cwd()))

export async function run(
  rawPayload: string,
  options: { vendor: Vendor; loadConfig?: ConfigLoader },
): Promise<RunResult> {
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
): Promise<RunResult> {
  const parsed = await parsePayload(entry, rawPayload)
  if (parsed.kind === 'invalid') {
    return respondParseFailed(entry, parsed.reason)
  }
  const collector = createAgentCallCollector(agent)
  const ctx = buildRuleContext(
    parsed.rawHistory,
    entry.toCanonical,
    collector.agent,
  )
  const outcome = await evaluate(parsed.action, rules, ctx, collector.hooks)
  return {
    response: respond(entry, outcome.decision),
    trace: collector.enrichTrace(outcome.trace),
  }
}

/**
 * Single chokepoint where a Decision becomes a vendor response string.
 * Brands block reasons with `Probity: ` so the host agent surface is
 * uniform regardless of which layer produced the reason.
 */
function respond(entry: VendorEntry, decision: Decision): string {
  const branded: Decision =
    decision.kind === 'block'
      ? { ...decision, reason: `Probity: ${decision.reason}` }
      : decision
  return entry.adapter.toResponse(branded)
}

function respondParseFailed(entry: VendorEntry, reason: string): RunResult {
  return {
    response: respond(entry, {
      kind: 'block',
      reason: `invalid hook payload: ${reason}`,
    }),
    trace: [{ kind: 'parse-failed', reason }],
  }
}

function buildRuleContext(
  rawHistory: (() => Promise<RawSessionEvent[]>) | undefined,
  toCanonical: VendorEntry['toCanonical'],
  agent: Agent,
): RuleContext {
  const history =
    rawHistory && toCanonical
      ? async () => (await rawHistory()).map(toCanonical)
      : undefined
  return {
    agent,
    ...(rawHistory && { rawHistory }),
    ...(history && { history }),
    readFile: (path) => safeReadCapped(path, { maxBytes: MAX_FILE_BYTES }),
  }
}

/**
 * Builds a fail-closed vendor response from an arbitrary error. Callers
 * (e.g. bin's stdin/argv layer) get a branded vendor-shaped block
 * without depending on Decision shape or adapter internals.
 */
export function failClosedResponse(vendor: Vendor, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error)
  return respond(vendors[vendor], { kind: 'block', reason })
}

type ParseResult =
  | {
      kind: 'ok'
      action: Action
      rawHistory: (() => Promise<RawSessionEvent[]>) | undefined
    }
  | { kind: 'invalid'; reason: string }

async function parsePayload(
  entry: VendorEntry,
  rawPayload: string,
): Promise<ParseResult> {
  const parsed = tryParseJson(rawPayload)
  if (parsed.kind === 'fail') return invalid(parsed.reason)

  const action = await entry.adapter.parseAction(parsed.value)
  if (!action.ok) return invalid(action.reason)

  const sessionPath = entry.adapter.sessionPath?.(parsed.value)
  return {
    kind: 'ok',
    action: action.action,
    rawHistory: sessionPath
      ? () => entry.readTranscript(sessionPath)
      : undefined,
  }
}

function tryParseJson(
  text: string,
): { kind: 'ok'; value: unknown } | { kind: 'fail'; reason: string } {
  try {
    return { kind: 'ok', value: JSON.parse(text) }
  } catch (error) {
    return {
      kind: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

function invalid(reason: string): ParseResult {
  return { kind: 'invalid', reason }
}
