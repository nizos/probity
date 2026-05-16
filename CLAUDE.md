# Probity

Process discipline for coding agents. A vendor-agnostic policy engine that sits between the agent and the codebase, evaluating each attempted action against configurable rules and blocking or allowing it, and providing correction and guidance.

## Discipline

- Strict TDD — failing test first, minimum impl to pass, no speculation.
- Atomic conventional commits — test and implementation together.

## Layout

- `src/types.ts` — canonical types (Action, Decision, Agent, Verdict, RawSessionEvent, SessionEvent)
- `src/rules/` — built-in rules + `contract.ts` (Rule type); `rules/utils/` holds shared rule helpers; `rules/matchers/` holds the ast-grep-backed test-node diff helper and per-language modules consumed by enforceTdd's fast-path
- `src/utils/` — cross-cutting helpers (json-string, parse-args, parse-as, read-capped, read-jsonl)
- `src/vendors/<vendor>/{adapter,agent,event,transcript}.ts` — per-vendor pieces (agents may be shared via the registry; `event.ts` classifies raw events to canonical)
- `src/vendors/{adapter,apply-edit,to-verdict,posix-absolute,relativize-path}.ts` — adapter contract, shared Edit-substitution helper, AI verdict parser, and POSIX path normalization helpers
- `src/registry.ts` — vendor entries (adapter + agent + transcript + canonical-event classifier per vendor)
- `src/{cli,bin,config,engine,index}.ts` — application wiring
- `test/fixtures/` — captured hook payloads, transcript fixtures, and config-loading scenarios used across unit and integration tests
- `test/integration/` — end-to-end tests; the AI-gated ones (`enforce-tdd-*`) require `PROBITY_INTEGRATION_AI=1`, the others run unconditionally
- `test/integration/helpers/` — shared integration-test helpers (`runBin`, `decodeResponse`, `createWriteAction`, `createSandbox`, `expectDecision`)
- `docs/adr/` — ADRs documenting load-bearing decisions and their rationale
