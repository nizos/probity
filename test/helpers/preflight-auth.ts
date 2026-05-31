import type { TestContext } from 'vitest'

import type { Agent } from '../../src/types.js'
import { isVendorAuthFailure } from './auth-patterns.js'

export type PreflightResult = { ok: true } | { ok: false; reason: string }

const PROBE_PROMPT = 'Respond with the JSON {"kind":"pass","reason":"probe"}.'

export async function preflightAuth(agent: Agent): Promise<PreflightResult> {
  if (process.env.PROBITY_INTEGRATION_AI !== '1') {
    return { ok: false, reason: 'PROBITY_INTEGRATION_AI is not set' }
  }
  const verdict = await agent.reason(PROBE_PROMPT)
  if (verdict.kind === 'violation' && isVendorAuthFailure(verdict.reason)) {
    return { ok: false, reason: verdict.reason }
  }
  return { ok: true }
}

export function skipIfUnauthed(
  preflight: PreflightResult,
  skip: TestContext['skip'],
): void {
  if (!preflight.ok) skip(true, preflight.reason)
}
