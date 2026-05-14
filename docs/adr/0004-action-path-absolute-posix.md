# ADR-0004: Make Action.path absolute POSIX; require payload cwd on writes

- **Status:** Accepted
- **Date:** 2026-05-01
- **Source commits:** c9fb683, 8326441

## Context

The canonical `Action.path` had been project-relative, anchored at the agent's reported working directory. That tied two distinct concerns into one shape. One concern was what the agent reported: an absolute path the agent had picked, anchored to the agent's own project root. The other was what the rule layer wanted: a path matchable against globs like `src/**`, anchored against the user's config root.

When the two anchors diverged, neither concern was served well. A rule that wanted to read the file off disk had to re-resolve the relative path against an environment variable that might or might not match the agent. A glob like `src/**` would or would not match depending on whose cwd had won the rounding.

A second issue compounded it. Payload cwd was optional, with a silent fallback to the validator's own process cwd. Agents always supply cwd in practice, but the optionality meant that an absent cwd would quietly anchor against the validator process, producing a relativized path that looked plausible but did not reflect what the agent saw.

## Decision

Pin the canonical `Action.path` to absolute POSIX. The adapter resolves the agent-reported path against the payload's cwd into a stable absolute form; nothing in the rule layer or engine has to re-resolve to read the file from disk. Glob-match relativization moves out of the adapter entirely and into config-load time, where it can anchor against the user's config root rather than the agent's working directory (see ADR-0005).

Payload cwd is required on writes. Absence is treated as malformed input and fails closed. The silent fallback to the validator's process cwd is removed; the relativization helper stops accepting an undefined cwd.

POSIX is the canonical form regardless of host platform: Windows-shaped paths in the payload are normalized at the adapter, so the rule layer never sees a backslash.

## Consequences

A rule that wants to open the file at `Action.path` calls `fs.open` directly. The two anchors are split cleanly: the adapter anchors at agent cwd to produce an absolute path; the config loader anchors at config root to rewrite globs. No silent fallback to the validator's process state can creep in. Path-handling concerns live in one place: the adapter for "make it absolute," and the config loader for "match it against globs."

## Considered alternatives

**Project-relative POSIX anchored at payload cwd** (the prior contract). Tying the path-on-disk concern and the glob-match concern to the same anchor produced ambiguity when the two roots diverged, and the optional cwd plus process-cwd fallback re-introduced the failure mode this change was meant to close.
