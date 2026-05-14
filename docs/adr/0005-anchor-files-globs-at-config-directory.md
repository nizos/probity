# ADR-0005: Anchor block-level `files` globs at the config directory

- **Status:** Accepted
- **Date:** 2026-05-01
- **Source commits:** ef332e2, b924b33, fc1c1af, 525cc8a

## Context

`Action.path` had just become absolute POSIX ([ADR-0004](0004-action-path-absolute-posix.md)). That flip broke every existing user-written glob. A user's `files: ['src/**']` no longer matched against `/abs/path/to/repo/src/foo.ts` because the glob was relative and the path was not.

Path scoping had two places it could live. Block-level `files` (the `{ files, rules }` grouping construct, modeled on ESLint's flat-config shape) could be anchored once at config-load time because the config file's location is known at that point. Per-rule `paths` (the older per-rule scoping option) could not be anchored that way, because rules know nothing about where the user wrote the glob.

Anchoring at the agent's payload cwd was on the table but had its own failure mode: when a session opens in a subrepo, or the agent changes directory mid-session, agent cwd diverges from the user's intent for "scope to this config." That re-introduces the failure mode the absolute-POSIX flip was meant to close.

## Decision

Anchor block-level `files` globs at the config file's directory at config-load time. The config loader joins `path.dirname(configFilepath)` with each user-written glob to produce an absolute glob. Globs starting with `**` are exempted, since their intent is "match anywhere" and anchoring them would defeat that intent. Negations carry the same convention through the `!` prefix.

Path filtering is exclusively a block-level concern. Rules stay a pure `(action, ctx) => result` with no path option, no matcher dependency, no awareness of where the user-written glob came from. Per-rule `paths` is removed from every built-in rule; the `{ files, rules }` block is the only scoping seam.

A user-facing trap is closed at the type level. `RuleBlock.files` distinguishes "omitted" (match every action) from "non-empty array" (filter writes). An empty array, which a matcher would otherwise read as match-everything, is a type error.

## Consequences

A user-written glob means what it reads as: relative to the config file's directory, regardless of where the agent ran or what its working directory is. Combined with the upward config walk ([ADR-0002](0002-walk-up-from-cwd-to-discover-config.md)), a config placed above the repo scopes its globs against that higher root, and the user gets one consistent answer regardless of which subdirectory the agent's session was opened in.

Rules become pure functions of action and context. There is one place a future contributor goes to find scoping logic, with one anchoring rule.

## Considered alternatives

**Anchor at the agent's payload cwd.** When a session opens in a subrepo, or the agent changes directory mid-session, agent cwd diverges from the user's intent for "scope to the config dir." This re-introduces the failure mode the absolute-POSIX flip was trying to close.

**Extend anchoring into rules to preserve per-rule `paths`.** This would keep two scoping seams with two anchoring rules and require rules to know about a config-load concept they should not see.
