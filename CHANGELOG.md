# @aliou/nvim-pi

## 0.7.0

### Minor Changes

- 62f13e6: Allow other Pi extensions to register custom file-writing tools for persistent-undo updates via the `neovim:undo:register-tool` event.

## 0.6.1

### Patch Changes

- b175307: Use ctx.ui.notify instead of pi.sendMessage for "no instance found" — avoids adding a message entry to the session

## 0.6.0

### Minor Changes

- 99dfa70: Remove static system prompt injection, rename `context` to `focused_buffer`, add `injectEditorState` config

  - **Breaking**: The `nvim_context` tool action `"context"` is renamed to `"focused_buffer"`. The `NvimContext` type is renamed to `NvimFocusedBuffer`.
  - **Breaking**: The static `<neovim-integration>` system prompt block is removed. Tool usage hints are now in `promptGuidelines` on the tool itself. Editor state injection uses a minimal `<neovim-editor-state>` XML block.
  - Added `injectEditorState` config toggle (default: off). When enabled, current editor state (open splits, cursor position) is injected into each prompt. Existing configs are migrated with a notification.
  - Internal: `extensions/nvim/config.ts` split into `config/` directory (`types.ts`, `migrations.ts`, `index.ts`).

## 0.5.0

### Minor Changes

- e02a69b: Add `load_extension` config option to control whether the bundled extension is passed via `--extension` when pi-nvim opens Pi. Defaults to `"auto"`, which skips `--extension` if nvim-pi is already installed globally (detected via `pi list`). Set to `true` to always pass `--extension`, or `false` to never pass it.

## 0.4.0

### Minor Changes

- 12f8c3f: Add an optional persistent undo extension for Neovim. When enabled, nvim-pi snapshots Pi edit/write tool calls and updates Neovim persistent undo files after successful external writes, preserving undo history across agent edits.

  Add `neovim:undotree` to inspect Neovim persistent undo state from Pi. The command includes file completion, an interactive file picker, and an undo tree overlay with preview support built from reconstructed undo snapshots.

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
