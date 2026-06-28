# ADR-0010: Validate rule results at the contract; keep their meaning in the engine

- **Status:** Accepted
- **Date:** 2026-06-28
- **Source commits:** 254ff40, 555ab4f, dee4793, 1013c8c

## Context

A rule returns a result the engine acts on. That result crosses from user-authored, fallible code into the engine: a rule can be hand-written or generated, can ship as JavaScript with no compiler backstop, and so can return something that is not a well-formed result at all.

The engine had been treating any returned value as a result and inspecting only whether it carried an objection. A value that was neither a pass nor a well-formed objection matched neither branch and fell through as "no objection," which the engine read as allow. In a tool whose whole purpose is to fail closed, a result the engine did not understand became a silent allow: the one fail-open in a pipeline that otherwise blocks on every uncertain input.

Two questions sat under the bug. Who establishes that a returned value is a usable result? And what does the engine actually need to know about a result?

## Decision

Separate two kinds of knowledge that had been entangled in the engine.

Whether a value is a usable result, its **validity**, is established at the rule contract, the same place that defines what a result is. The engine consumes results already recognized as valid; it does not itself carry the structural knowledge of what a result looks like.

What a valid result **means** stays in the engine, because that is the engine's reason to exist: an objection becomes a block, and the absence of one continues to the next rule. This mapping is total over valid results, so a future kind of result surfaces as a place that must be given meaning rather than something that falls through.

A value that is not a usable result, and a rule that errors while producing one, are the same event: the rule did not yield a usable answer. Both fail closed, uniformly, putting the rule-output boundary on the same footing as malformed input, which already fails closed before any rule runs.

The validity check is a lightweight recognition of shape, not a defensive sanitizer. Per the threat model in [ADR-0008](0008-rule-context-readfile-capability.md), rules are fallible first-party code, not an adversary; a misbehaving rule has far cheaper ways to do harm than a malformed return value. The check guards against mistakes, stays minimal, and leaves the rule's own result untouched once recognized.

## Consequences

There is one place a contributor goes to find or change what counts as a valid result: the rule contract, beside the type that defines it. The engine stays a thin consumer that knows how to act on a result, not how to recognize one, and does not accrete structural knowledge of rule internals over time.

The silent allow is closed by construction rather than patched: a result the engine cannot use fails closed on the same footing as a rule that errors and as input that cannot be parsed. Adding a new kind of result becomes a deliberate change to the contract and the engine's meaning-mapping, caught by the compiler instead of slipping through as an accidental allow.

## Considered alternatives

**Validate inside the engine.** A guard inlined where results are consumed closes the same hole, but keeps the engine holding the full structure of a result and invites it to accrete more such knowledge with each change. Recognizing a result belongs with the contract that defines one.

**Trust the type and validate nothing.** The result type already constrains what a rule may return, so in principle no runtime check is needed. But the value crosses from user-authored code that can ship as unchecked JavaScript; a fail-closed engine cannot make its safety contingent on the producer having been compiled.

**Defensively sanitize rule output.** Treating the result as untrusted and normalizing it would defend against a rule that actively lies. Rejected on the same threat model as [ADR-0008](0008-rule-context-readfile-capability.md): a malicious rule has cheaper paths to harm, so hardening the output path buys no real safety and adds standing complexity.
