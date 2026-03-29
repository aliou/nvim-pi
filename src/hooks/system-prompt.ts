/**
 * System Prompt Hook
 *
 * Injects static Neovim integration guidance into the system prompt on every
 * turn. This replaces the --append-system-prompt CLI flag that the Lua plugin
 * previously passed when launching Pi.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const NVIM_GUIDANCE = `\
<neovim-integration>
You are running with the pi-nvim extension.

## Automatic Context

On each prompt, you receive the current editor state:
- All visible splits with file paths, filetypes, and visible line ranges
- Which split has focus and cursor position

## File Changes

When you modify files with write/edit tools:
- Neovim automatically reloads unchanged buffers
- If LSP detects errors in modified files, you will receive them after your turn

## Available Tool: nvim_context

Query the editor for additional context using the nvim_context tool:
- "context": Focused file details including visual selection text
- "splits": All visible splits with metadata
- "diagnostics": LSP diagnostics for the current buffer
- "current_function": Treesitter info about the function/class at cursor
</neovim-integration>`;

export function registerSystemPromptHook(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${NVIM_GUIDANCE}`,
    };
  });
}
