# ADR-0006: Make ast-grep language packs optional peer-deps for the TDD fast-path

- **Status:** Accepted
- **Date:** 2026-05-03
- **Source commits:** d07fefd, 90dbed7, 362bcb5, 0ce2f80

## Context

The TDD validator's rubric had an unconditional branch: "adding a test is always allowed." Every Write to a test file paid the cost of an AI call that the rubric mechanically guaranteed would return pass for the "added exactly one new test" case. A rule should not pay for AI judgment on a question the rubric itself answers in code.

A reliable AST check across multiple languages was the missing piece. Regex would miscount test names inside comments and strings. Tree-sitter would supply the parse but no pattern language to express "this is a test." Compiler-specific tools would lock the project to JavaScript and TypeScript. Shelling out to a CLI binary was wrong shape for a per-hook validator on a millisecond budget.

Once the AST tool was chosen, an install-time question followed. The tool's built-in tier covers a small set of languages. Languages outside that tier ship as separate packs, each several to tens of megabytes. Bundling them all as regular dependencies would balloon Probity's install footprint with grammars no individual user needs. Making missing packs a hard error would force users to install grammars for languages they never write.

## Decision

Adopt ast-grep (`@ast-grep/napi`) as the AST tool. Layer a deterministic fast-path inside the TDD rule before the AI call: when the language is known and the diff adds exactly one test-shape node, return pass without invoking the validator. Any other outcome (unknown language, ambiguous diff, non-1 delta) falls through to the AI.

Each language lives in its own module under `src/rules/matchers/languages/` holding the language's parser handle and test-node patterns. A single `inferLanguage(filePath)` performs extension dispatch. Adding a language is one new file and one dispatch entry.

Non-built-in language packs are optional peer-deps with fail-soft runtime. At install time, each pack is declared as a `peerDependency` with `peerDependenciesMeta.optional: true`; package managers do not warn on absence. At runtime, each language module wraps the pack require in a try-catch. If the pack is not installed, the parser handle becomes undefined rather than throwing at module load, and the shared count helper short-circuits to zero. The fast-path silently falls through to the AI, with no user-visible difference except cost.

The deterministic gate can pass but never block; only the AI can block. The rubric stays the source of truth for what is allowed; the fast-path is an implementation that operationalizes one branch of it.

## Consequences

Single-test additions in supported languages skip the LLM call entirely. Users install only the packs they use; Probity stays loadable regardless of which packs are present. The fast-path-then-AI design absorbs missing packs as graceful degradation rather than a failure mode. A future language with idiosyncratic test conventions carries its own knowledge in its own file.

## Considered alternatives

**Bundle every language pack as a regular dependency.** Per-language packs are several to tens of megabytes; the project would never need most of them at any one time.

**Make a missing pack a hard error with install instructions.** The AI fall-through path makes the language pack an optimization, not a precondition. A user without a pack can still use the rule; they just pay the AI cost on writes the fast-path would have caught.

**Tree-sitter directly, Semgrep, compiler-bound tools, or shelling out to the ast-grep CLI.** Tree-sitter lacks a pattern DSL. Semgrep pulls an OCaml runtime and orders-of-magnitude more install footprint. Compiler-bound tools lose the multi-language story. The CLI's cold-start cost is too high for a per-hook validator.
