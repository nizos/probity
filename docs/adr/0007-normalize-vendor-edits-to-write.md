# ADR-0007: Normalize vendor edits to a fail-closed Write with post-edit content

- **Status:** Accepted
- **Date:** 2026-05-03
- **Source commits:** 6f0b549, 9236b58

## Context

Several vendors expose edit-shape tool calls (substring substitution given an old string and a new string), distinct from the write-shape tool calls (full file content). The canonical Action carried only Write. Adapters were emitting `Action.content` for an edit as the new-string snippet, which forced rules to compare partial snippets against whole-file state. A first attempt put the file read inside the adapter with a silent fallback to the snippet on failure, producing an Action whose content claimed to be the post-edit body but was the snippet whenever the read failed.

The architectural concern was where the Edit→Write normalization lives, what `Action.content` means for an edit, and what happens when the substitution cannot be computed.

## Decision

An edit-shape tool call becomes a canonical Write whose `content` is the full post-edit file body. The adapter, not the rule, materializes that body: it reads the target file and applies the substitution. The substitution carries explicit fail-closed semantics. If the file is missing, the old string does not occur, or it occurs more than once when replace-all is not requested, the parse fails closed. No silent fallback to the snippet.

A shared helper at the vendors root expresses these semantics so every edit-shape adapter borrows the same behavior rather than reinventing the failure modes per vendor.

The canonical Write remains unchanged, but an adapter may also retain its validated Edit descriptor as non-serializable metadata keyed by the Action object's identity. AI rules can use that descriptor as a prompt projection without changing what deterministic or custom rules see in `Action.content`. `enforceTdd` uses this compact projection only for post-images of at least 64 KiB where it is at least four times smaller than the full content. Ordinary files keep the full before/after context.

The projection reads disk, so `parseAction` becomes async (`Promise<ParseActionResult>`). The CLI's parse step becomes async in lockstep. I/O in the parsing path stays inside the adapter; adapters with no I/O pay nothing beyond an extra `await`.

## Consequences

Rules see a uniform "this is what the file will look like after the write" regardless of whether the underlying tool call was an edit or a write. The cost of the file read sits at the boundary, not in the rule layer. Edit-shape tool calls that cannot be resolved become parse-time errors rather than misleading no-op Actions. Vendor projections that depend on filesystem state fit the same contract as projections that do not, and the CLI does not branch on whether a vendor is sync or async.

The optional Edit metadata depends on the engine passing the same Action object from parsing to rule evaluation. Cloning or serializing an Action intentionally drops the metadata, in which case AI rules fall back to the canonical full-content path. The public Action shape and its JSON representation therefore remain backward compatible.
