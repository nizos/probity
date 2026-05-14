# ADR-0001: Isolate vendor protocols behind per-vendor adapters

- **Status:** Accepted
- **Date:** 2026-04-18
- **Source commits:** d0fb192

## Context

Probity evaluates coding-agent actions against rules. Each vendor's hook protocol uses its own field names, tool-call shapes, and conventions, and each vendor's hook response shape is just as idiosyncratic. If rules read those payloads directly, every new vendor becomes a sweep across the rule layer, and the rule domain inherits each vendor's idiom and noise. The leak runs in both directions: inbound payloads and outbound responses.

The first vendor was being wired up. This was the moment to decide where vendor knowledge would live, before more rules and more vendors locked in a mixed shape.

## Decision

Place a per-vendor adapter between each vendor's hook protocol and the rule domain. The adapter is the anti-corruption layer: it speaks the vendor's native payload on one side and a single canonical shape on the other. Rules read canonical `Action`s; the engine returns canonical `Decision`s; vendor payload structure and response shape stay inside the adapter.

The adapter is the seam in both directions. `parseAction` translates the vendor's payload into a canonical `Action`. `toResponse` translates a canonical `Decision` back into the vendor's hook response, including any internal asymmetry between allow and block in the vendor's protocol. Both directions live in the same per-vendor module so the vendor's protocol is fully encapsulated.

Each vendor lives as its own folder under `src/vendors/<vendor>/` holding its adapter, transcript reader, and (when present) agent factory. Per-tool variance within a vendor is the adapter's private concern; the canonical shape stays uniform across vendors.

Unknown tool names parse as no-op commands rather than failing the payload: a vendor's SDK can grow new tools without breaking Probity. Known-malformed payloads (Bash with no command, Edit with no oldString) still fail closed.

## Consequences

Rules and the engine stay vendor-agnostic. Adding a new vendor is one folder containing one adapter, not a sweep across the rule layer. Vendor-protocol details stay inside the adapter. A new vendor with a fourth distinct response shape requires no changes outside its own folder. Probity is not an allow-list of tool names; only tools that match a rule are evaluated.
