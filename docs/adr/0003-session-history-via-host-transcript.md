# ADR-0003: Pass raw vendor transcripts to AI rules; normalize only for deterministic rules

- **Status:** Accepted
- **Date:** 2026-04-24
- **Source commits:** 367b447, 1ac728b, 90847e2, aaa0018

## Context

The first AI rule needed recent session activity to distinguish "the user is editing without running their tests" from "the user just watched a test fail and is writing the implementation." Two questions came with it: where the data comes from, and what shape rules see.

Sourcing was the simpler half. Host coding agents already write a session transcript to disk; Probity reads it and carries no session state.

The shape question had an obvious wrong answer. ADR-0001 placed an anti-corruption layer between vendor payloads and the rule domain; applying the same pattern to history would classify each vendor's events into a domain-shaped kind and feed rules the normalized stream. That move is right for one consumer and wrong for the other.

An AI rule's consumer is a language model trained on real host transcripts in their native form: vendor field names, tool envelopes, output conventions. Anything Probity normalizes away is shape the model has not been trained to read and may interpret as truncated, synthesized, or malformed. The validator's signal compounds as more training data accumulates on these formats; normalizing degrades it for no offsetting gain, while still carrying the maintenance cost of keeping a canonical schema current with each vendor.

A deterministic rule's consumer is code, asking domain questions like "did the required command run since the last write?" Code needs vendor-agnostic semantics; it should not learn that one vendor's command tool is named one thing and another's something else. For that consumer, normalization is the right move.

## Decision

Source session history from the host's transcript. Each vendor owns its parser, producing vendor-shaped `RawSessionEvent`s.

Expose two views on the rule context:

- **`ctx.rawHistory()`** returns `RawSessionEvent[]` (vendor tool name, raw input, raw output, tool-use id preserved). **AI rules consume this view.**
- **`ctx.history()`** returns canonical `SessionEvent[]`: a discriminated union of domain kinds (`prompt`, `command`, `write`, `other`). Each vendor registers an optional `toCanonical(raw)` classifier. **Deterministic rules consume this view.**

Both accessors are optional. A vendor without a classifier still exposes raw; a vendor without a transcript reader exposes neither. Rules that ignore history pay nothing.

Engine wiring keeps the vendor folder small: the adapter exposes a pure `sessionPath(payload): string | undefined`; the engine pairs it with the vendor's `readTranscript` (a registry field) and composes both accessors itself. Each rule that uses history declares its own event count and per-event character cap, trimmed at the rule's call site through a shared helper.

## Consequences

AI validation runs on the transcript shape the host writes and the model knows; signal compounds with training rather than diverging. Deterministic rules get vendor-agnostic events without the AI path paying for the abstraction. The raw-event contract is the only thing that crosses the vendor boundary on the AI path, regardless of how baroque the parser behind it becomes.

## Considered alternatives

**Normalize all transcripts and feed only the canonical view to rules**, symmetric with the action-side anti-corruption layer ([ADR-0001](0001-per-vendor-adapter-anti-corruption-layer.md)). The maintenance cost is real and the AI-path signal loss is the deciding factor; the split-view keeps the symmetry where it pays and breaks it where it costs.

**Contrast with Write normalization ([ADR-0007](0007-normalize-vendor-edits-to-write.md)).** Normalize where the rule's question is about the _result_ (TDD cares about the post-edit content, so Edit→Write is lossless). Leave raw where the rule's question is about the _context_ (AI validation uses tool envelopes and output formatting for signal, so collapsing them would be lossy).
