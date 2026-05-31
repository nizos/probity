# Probity

Process discipline for coding agents. A vendor-agnostic policy engine that sits between the agent and the codebase, evaluating each attempted action against configurable rules and blocking or allowing it, and providing correction and guidance.

## Discipline

- Strict TDD — failing test first, minimum impl to pass, no speculation.
- Atomic conventional commits — test and implementation together.

## Layout

- `src/types.ts` — the canonical domain types every layer shares.
- `src/rules/` — the built-in rules and the rule contract.
  - `rules/utils/` — shared rule helpers.
  - `rules/matchers/` — ast-grep test-node detection and the per-language modules enforceTdd's fast-path uses.
- `src/utils/` — low-level cross-cutting helpers (parsing, safe and size-capped file reads, JSON/JSONL).
- `src/vendors/` — vendor-agnostic shared pieces (adapter contract, Edit-to-Write substitution, verdict parsing, path normalization).
  - `<vendor>/` — one vendor's adapter, AI agent, raw-event classifier, and transcript reader.
- `src/registry.ts` — wires each supported vendor to its pieces.
- `src/` (top level) — application wiring: CLI, bin entry, config loading, the engine, and the trace it writes to the `--debug` log.
- `test/fixtures/` — captured hook payloads, transcript fixtures, and config scenarios.
- `test/helpers/` — shared helpers for the unit and integration suites (sandboxing, bin invocation, response decoding, auth preflight).
- `test/integration/` — end-to-end tests; the AI-gated ones (`enforce-tdd-*`) need `PROBITY_INTEGRATION_AI=1`, the rest always run.
- `docs/adr/` — ADRs for load-bearing decisions and their rationale.
