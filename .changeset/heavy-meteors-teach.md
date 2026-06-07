---
"@aliou/nvim-pi": minor
---

Remove static system prompt injection, rename `context` to `focused_buffer`, add `injectEditorState` config

- **Breaking**: The `nvim_context` tool action `"context"` is renamed to `"focused_buffer"`. The `NvimContext` type is renamed to `NvimFocusedBuffer`.
- **Breaking**: The static `<neovim-integration>` system prompt block is removed. Tool usage hints are now in `promptGuidelines` on the tool itself. Editor state injection uses a minimal `<neovim-editor-state>` XML block.
- Added `injectEditorState` config toggle (default: off). When enabled, current editor state (open splits, cursor position) is injected into each prompt. Existing configs are migrated with a notification.
- Internal: `extensions/nvim/config.ts` split into `config/` directory (`types.ts`, `migrations.ts`, `index.ts`).
