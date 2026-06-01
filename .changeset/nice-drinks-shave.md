---
"@aliou/nvim-pi": minor
---

Add `@vim:` autocomplete provider for open Neovim splits. Type `@vim:` in Pi's input editor to complete file paths from visible splits.

Refactor extension into `extensions/nvim/` + core `src/` pattern. `src/` now contains only pure Neovim logic (lockfile discovery, RPC, domain types) with zero Pi dependencies. Extension wiring lives in `extensions/nvim/`.

Add `extensions/nvim-splits-autocomplete/` as a separate extension entry point.

Update Pi peer dependencies to 0.78.0.

Switch from lefthook to husky for pre-commit hooks. Add changesets for version management. Add CI and publish GitHub workflows.
