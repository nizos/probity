# ADR-0002: Walk up from cwd to discover the config file

- **Status:** Accepted
- **Date:** 2026-04-23
- **Source commits:** c75e38f, fac9adc

## Context

Probity's bin runs as a hook handler, fired per tool call, with no explicit config location supplied. The handler has only the agent's process cwd to work with. Forcing users to pass `--config` on every invocation would push that wiring into the host agent's hook configuration, where it is brittle and hard to template. Defaulting to "config must be in the agent's cwd" rules out shared configs (one config used by multiple repos) and monorepo setups (one config at the top, agent sessions opened in a subpackage). Both shapes were known wants.

The decision was where the config lookup starts and how far it walks, while keeping the bin layer's single source of truth for "what rules apply to this session" reachable without per-invocation flags.

## Decision

`findConfig(startDir)` walks up from the start directory until it finds `probity.config.{ts,mts,js,mjs}`, returning the first match's absolute path. The default `startDir` is the bin process's cwd. The walk stops at the filesystem root; if no candidate is found, it throws, and the bin layer turns the throw into a fail-closed block (`probity: <reason>` on stdout, vendor-shaped). Missing configs do not silently allow.

A user who wants to override the discovery passes `--config <path>` explicitly. Otherwise, the upward walk is the contract.

The extension list (`ts, mts, js, mjs`) covers TypeScript and JavaScript module variants. The first extension found at a given directory wins.

## Consequences

A config can live where the user actually wants it: at the repo root, above the repo (one config shared across sibling repos), at the top of a monorepo with sessions opened in subpackages, or in the user's home directory. The agent's session can open anywhere inside that subtree and still discover the config. Probity does not invent a config-location convention; it absorbs whatever directory layout the user already has.

The walk is silent: it does not warn on multiple candidates along the path. The first match wins, and a user who places a more specific config closer to the agent's cwd gets that one.
