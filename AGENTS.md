# Agent instructions

This repo is indexed by CodeGraph (see `.codegraph/codegraph.db`). When answering structural questions — "where is X defined?", "who calls Y?", "what breaks if I change Z?", cross-language flow (TS ↔ Rust via Tauri) — prefer the CodeGraph MCP tools over grep/file reads:

- `codegraph_explore` — semantic search over symbols, call paths and references (single call, returns source + relationships).
- `codegraph_node` — one symbol's source plus caller/callee trail, or a file with dependents.

Fall back to `grep_search` / `read_file` only when CodeGraph has no hit (it tracks indexed source, not arbitrary text).

Keep the index fresh: run `codegraph sync` when working from a terminal after large uncommitted changes, or `codegraph status` to check health. Do not commit anything under `.codegraph/` — it is machine-local (already git-ignored, keep the ignore).
