# @aliou/nvim-pi

## 0.4.0

### Minor Changes

- 12f8c3f: Add an optional persistent undo extension for Neovim. When enabled, nvim-pi snapshots Pi edit/write tool calls and updates Neovim persistent undo files after successful external writes, preserving undo history across agent edits.

  Add `vim:undotree` to inspect Neovim persistent undo state from Pi. The command includes file completion, an interactive file picker, and an undo tree overlay with preview support built from reconstructed undo snapshots.

  Add settings for toggling optional nvim-pi extensions. Completion stays enabled by default, undo stays disabled by default, settings are now scoped by extension (`nvim`, `completion`, and `undo`), and the old top-level `showConnectionMessages` config is migrated into the new `nvim` scope.

  Add a generated JSON Schema for nvim-pi settings and wire saved settings files to the schema hosted on GitHub.

  Make the undo extension discoverable when installing nvim-pi directly as a Pi package by registering it in package metadata.

## 0.3.0

### Minor Changes

- 3b269b8: Add `@vim:` autocomplete provider for open Neovim splits. Type `@vim:` in Pi's input editor to complete file paths from visible splits.

  Refactor extension into `extensions/nvim/` + core `src/` pattern. `src/` now contains only pure Neovim logic (lockfile discovery, RPC, domain types) with zero Pi dependencies. Extension wiring lives in `extensions/nvim/`.

  Add `extensions/nvim-splits-autocomplete/` as a separate extension entry point.

  Update Pi peer dependencies to 0.78.0.

  Switch from lefthook to husky for pre-commit hooks. Add changesets for version management. Add CI and publish GitHub workflows.
