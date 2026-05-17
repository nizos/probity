# ADR-0008: Filesystem reads as a `ctx.readFile` capability; rules see a 3-state result

- **Status:** Accepted
- **Date:** 2026-05-17
- **Source commits:** TBD

## Context

`enforceTdd` needs the pre-edit content of the file the agent is about to write, so it can compare before to after. It was reaching into the filesystem directly: an inline helper carrying `O_NOFOLLOW`, a size cap, an error-code predicate, and a 3-state local type. PR #23 fixed a real bug in that helper but left the filesystem semantics inside the rule body, where any future rule with similar needs would duplicate them.

The same anti-corruption pattern that motivated ADR-0001 (vendor payloads to canonical `Action`) and ADR-0003 (vendor transcripts to `ctx.history` / `ctx.rawHistory`) applies. Rules are domain code; the filesystem is infrastructure; the seam between them should be a capability injected through context.

## Decision

Add `RuleContext.readFile: (path) => Promise<FileContent>` alongside the existing context capabilities. `FileContent` is a discriminated union of `{ kind: 'present'; content }`, `{ kind: 'absent' }`, and `{ kind: 'unknown' }`. Three states, not two: `absent` is a normal new-file write target (rule treats as empty); `unknown` is "the engine refused to safely surface this content, so a diff against it is unverifiable." Folding them would erase a distinction `enforceTdd`'s fast-path depends on.

`src/utils/safe-read.ts` implements the capability: open with `O_NOFOLLOW`, enforce a size cap, classify `ENOENT` as `absent` and every other failure as `unknown`. Rules never see filesystem error kinds. The engine binds the helper at the cli dispatch site with a 1 MiB cap and always supplies it; rules that ignore the capability pay nothing. Rule policy on `unknown` is rule-defined, not framework-defined; `enforceTdd` falls through to the AI, keeping faith with ADR-0006's intent that the fast-path only passes when verification is actually possible.

## Consequences

Filesystem error handling lives in one place. Rules that need a file's content reach for the same affordance; their bodies do not import `node:fs`. Tests inject fake `readFile` stubs through `ctx` rather than mocking module imports. The symlink-collapse-bypass that PR #23 closed stays closed by construction.

## Considered alternatives

**Auto-read the pre-image for every write action** and pass it precomputed on `Action` or `ctx`. Forces a syscall every evaluation for a need only one rule has today; couples the engine to write-shaped behavior. `Action` stays declarative; pre-image is environmental and queryable.

**Import the helper directly from rules.** Simpler at the call site but breaks the dependency direction `agent` and `history` already follow. Tests would mock module imports rather than inject fakes.

**Two-state `present | unknown`.** `absent` and `unknown` carry different rule-level meaning and `enforceTdd` branches differently on each. Folding them costs information the rule uses.

**Constrain `readFile` paths to within the project root.** Defense-in-depth, but the threat model is malicious agent payloads, not malicious rules. A rule could read outside the project by importing `fs` anyway; the constraint adds complexity for no real threat reduction.
