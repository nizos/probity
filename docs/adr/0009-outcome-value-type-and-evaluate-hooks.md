# ADR-0009: Engine returns an Outcome value type; cross-cutting concerns subscribe via lifecycle hooks

- **Status:** Accepted
- **Date:** 2026-05-22
- **Source commits:** 10974d6, 3154906, f604c4f, 04cdd95, 80996cf, d95fe58

## Context

The engine returned a bare `Decision`. The cli formatted it into a vendor response string; bin wrote it. That single string was the wire format for the host agent, the input to the operator's `--debug` log, and the only carrier of "what happened" for any future cross-cutting concern.

Two pain points surfaced this. A hostile lookup for block-reason sources found four (rule violations, engine rule-throw, cli parse-fail, bin fail-closed), each independently prefixing or not prefixing the brand, with no chokepoint. Branding responses uniformly would require either a string-mutating sweep or a real seam. Separately, the `--debug` log written from bin could only show the request and the response strings; everything between them (which rules ran, how long each took, what the AI said, whether the fast-path fired) was already produced by the engine but discarded at the wire.

The deeper shape: the engine and its callers form a strictly narrowing pipeline. Each layer takes a richer input and produces a narrower output. By the time the response reached the wire, all that remained was the externalized string. There was no place to add cross-cutting concerns at the use-case level.

## Decision

The engine returns an `Outcome` value type bundling the `Decision` with a structured trace of how that decision was reached. The Decision is the narrow projection sent over the wire; the trace carries intermediate context for operator-facing consumers. The cli's composition root projects the Outcome onto two channels: Decision flows through a single chokepoint that applies the `Probity: ` brand and calls the vendor adapter; trace flows to the operator log. Branding lives in one place by virtue of the chokepoint existing; observability lives in one place by virtue of the trace carrying enough to surface.

`TraceEntry` is a discriminated union: `rule-evaluated` records a rule that ran and the result it returned (including the violator on short-circuit); `rule-threw` attributes a thrown rule's error; `parse-failed` records the cli rejecting a payload before the engine ran. The engine's try/catch moved inside the rule loop so each rule call has its own attribution.

The engine also exposes a capability-agnostic lifecycle observer port: hooks fire around each rule call (the end-hook in a `finally` so it survives violations and throws). The engine does not import any specific capability; the hooks surface is intentionally agnostic about what observers do with the events.

AI validator telemetry rides on the hooks as its first subscriber. The cli composes a small agent-call collector at dispatch: it wraps the rule's agent capability to record each call's duration and verdict, uses the engine's hooks to attribute calls to the current rule, and enriches that rule's trace entry. Rules are not the courier. Vendor agents populate vendor-normalized telemetry (model, token counts) from each SDK's native shape.

The `--debug` JSONL log now carries the request, response, and trace. The host-agent response is unchanged: still only the Decision in vendor format, now uniformly branded.

## Consequences

The composition root is the one place that knows how a Decision becomes a vendor response, and the one place that projects an Outcome onto its two audiences. Branding is uniform without per-layer cooperation. The operator log can show which rule fired, how long it took, what the AI said even on pass, and which model and how many tokens each validator call used. Bin no longer reaches into vendor adapters to construct fail-closed Decisions; the cli owns that seam.

Rule authors stay focused on policy. A rule that needs the AI calls its agent capability and uses the verdict; trace attribution and telemetry flow out of the engine and cli wiring without the rule's cooperation. Future AI rules inherit the same capture for free.

The engine still does not introspect `RuleContext`; it does not import `Agent`; it does not know what hooks observe. Future cross-cutting concerns (per-rule metrics, profiling, structured audit logs) share the same hooks port. Adding one is "wire a new observer at the composition root," not "grow the engine."

The published API surface is additive only. Existing rule and config code keeps working.

## Considered alternatives

**Engine wraps `ctx.agent` directly.** Cleanest from a single-purpose lens, but it would force the engine to import the agent capability and special-case one slot of `RuleContext`. Once the engine knows about one capability, the door is open to special-casing others, eroding the opaque-`RuleContext` property the engine has preserved since inception. The hooks port stays generic at the cost of a small amount of cli wiring.

**Rule forwards telemetry into a note on its result.** Smallest engine surface, but every future AI rule pays the same boilerplate, and the operator log depends on per-rule cooperation. The engine-hook approach removes the per-rule courier cost.

**Domain Events with an event bus.** The textbook DDD answer to "many audiences for what happened." Right at large scale; over-ceremonious for a project with one cross-cutting subscriber today. The hooks port is a thinner observer we can grow into Domain Events later if the surface earns its keep.

**Output Port / Presenter (Clean Architecture).** Use case takes an output port and pushes into it; presenters format for each audience. Right when the use case has several mature audiences. Probity's idiom is value-return everywhere; Output Port would invert that for one concern.

**Recorder injected via `RuleContext`.** Closer to the per-rule cooperation cost above and would re-litigate the opaque-`ctx` principle (every observer addition becomes a `ctx` field). The hooks port lives next to evaluate's other parameters, not in `ctx`, so observers are framework-level concerns at the composition root rather than rule capabilities.
