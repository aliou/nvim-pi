/**
 * Neovim Context Hook
 *
 * Lifecycle events:
 * - session_start: auto-connects to Neovim instance
 * - before_agent_start: injects editor state (splits, cursor position)
 * - tool_result: reloads files in Neovim when write/edit tools complete
 * - turn_end: sends LSP errors for modified files
 */

import * as path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatPath } from "../../../src/format";
import { discoverNvim, queryNvim } from "../../../src/nvim";
import {
  isDiagnosticsForFilesResult,
  isSplitsResult,
  type SplitInfo,
} from "../../../src/types";
import type { ResolvedNvimConfig } from "../config";
import type { NvimConnectionState } from "../connection";
import { clearNvimSocket, resolveNvimSocket } from "../connection";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format splits info into a minimal editor-state block for the system prompt.
 */
function formatEditorState(splits: SplitInfo[], cwd: string): string {
  const lines: string[] = ["<neovim-editor-state>"];

  for (const split of splits) {
    const filePath = formatPath(split.file, cwd);
    const focused = split.is_focused ? " (focused)" : "";
    let line = `${filePath}${focused} visible-lines:${split.visible_range.first}-${split.visible_range.last}`;

    if (split.is_focused && split.cursor) {
      line += ` cursor:${split.cursor.line}:${split.cursor.col}`;
    }

    lines.push(line);
  }

  lines.push("</neovim-editor-state>");
  return lines.join("\n");
}

/**
 * Format diagnostics into a message for the LLM.
 */
function formatDiagnosticsMessage(
  diagnostics: Record<
    string,
    { line: number; col: number; message: string; source?: string }[]
  >,
  cwd: string,
): string {
  const lines: string[] = ["LSP errors detected in modified files:"];

  for (const [file, errors] of Object.entries(diagnostics)) {
    const filePath = formatPath(file, cwd);
    lines.push(`\n${filePath}:`);
    for (const err of errors) {
      const source = err.source ? ` (${err.source})` : "";
      lines.push(`  L${err.line}:${err.col}: ${err.message}${source}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Hook Registration
// ============================================================================

export type { NvimConnectionState } from "../connection";

export function registerNvimContextHook(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  const shouldShowConnectionMessages = () =>
    getConfig().nvim.showConnectionMessages;

  // -------------------------------------------------------------------------
  // Session start: auto-connect to Neovim
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    // Reset state
    clearNvimSocket(state);
    state.modifiedFilesThisTurn = new Set();

    const instances = discoverNvim(ctx.cwd);
    if (instances.length === 0) {
      if (shouldShowConnectionMessages()) {
        ctx.ui.notify("nvim: no instance found", "info");
      }
      return;
    }

    const result = await resolveNvimSocket(pi, ctx.cwd, state, {
      interactive: true,
      ui: {
        hasUI: ctx.hasUI,
        select: ctx.ui.select.bind(ctx.ui),
      },
    });

    if (result.error) {
      if (shouldShowConnectionMessages()) {
        // Determine status from error message
        const status = result.error.includes("Multiple") ? "multiple" : "none";
        const instanceCount =
          status === "multiple" ? instances.length : undefined;
        pi.sendMessage({
          customType: "nvim-connection",
          content: `nvim: ${result.error}`,
          display: true,
          details: { status, instanceCount },
        });
      }
      return;
    }

    if (!result.socket) {
      return;
    }

    if (shouldShowConnectionMessages()) {
      // Find matching instance for PID display
      const matchedInstance = instances.find(
        (i) => i.lockfile.socket === result.socket,
      );
      const pid = matchedInstance?.lockfile.pid;

      pi.sendMessage({
        customType: "nvim-connection",
        content: `nvim: connected${pid ? ` (PID ${pid})` : ""}`,
        display: true,
        details: {
          status: "connected",
          pid,
          socket: result.socket,
        },
      });
    }

    // Notify Neovim via RPC
    try {
      await queryNvim(pi.exec, result.socket, {
        type: "notify",
        message: "Connected",
        level: "info",
      });
    } catch (error) {
      // Ignore notification failures.
      void error;
    }
  });

  const shouldInjectEditorState = () => getConfig().nvim.injectEditorState;

  // -------------------------------------------------------------------------
  // Before agent start: inject editor state into system prompt
  // -------------------------------------------------------------------------

  pi.on("before_agent_start", async (event, ctx) => {
    // Reset modified files tracking for new prompt
    state.modifiedFilesThisTurn = new Set();

    if (!shouldInjectEditorState() || !state.socket) return;

    try {
      const raw = await queryNvim(pi.exec, state.socket, "splits", {
        signal: ctx.signal,
        timeout: 2000,
      });

      if (!isSplitsResult(raw) || raw.length === 0) {
        return;
      }

      const editorState = formatEditorState(raw, ctx.cwd);

      return {
        systemPrompt: `${event.systemPrompt}\n\n${editorState}`,
      };
    } catch {
      // Query failed, continue without editor state
      return;
    }
  });

  // -------------------------------------------------------------------------
  // Tool result: reload files and track modifications
  // -------------------------------------------------------------------------

  pi.on("tool_result", async (event, ctx) => {
    // Track modified files for diagnostics at turn end
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input?.path as string | undefined;
      if (filePath && !event.isError) {
        const normalizedPath = filePath.startsWith("@")
          ? filePath.slice(1)
          : filePath;
        // Convert to absolute path for consistent tracking
        const absPath = path.resolve(ctx.cwd, normalizedPath);
        state.modifiedFilesThisTurn.add(absPath);

        // Notify Neovim to reload the file
        if (state.socket) {
          try {
            await queryNvim(
              pi.exec,
              state.socket,
              {
                type: "reload",
                files: [absPath],
              },
              { signal: ctx.signal, timeout: 2000 },
            );
          } catch (error) {
            // Ignore reload failures.
            void error;
          }
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Turn end: send LSP errors for modified files
  // -------------------------------------------------------------------------

  pi.on("turn_end", async (_event, ctx) => {
    if (!state.socket) return;
    if (state.modifiedFilesThisTurn.size === 0) return;

    try {
      const raw = await queryNvim(
        pi.exec,
        state.socket,
        {
          type: "diagnostics_for_files",
          files: Array.from(state.modifiedFilesThisTurn),
        },
        { signal: ctx.signal, timeout: 3000 },
      );

      // Validate and only send if there are errors
      if (!isDiagnosticsForFilesResult(raw) || Object.keys(raw).length === 0) {
        return;
      }

      const message = formatDiagnosticsMessage(raw, ctx.cwd);

      // Send as a follow-up message (waits for agent to finish)
      pi.sendMessage(
        {
          customType: "nvim-diagnostics",
          content: message,
          display: true,
          details: { diagnostics: raw },
        },
        {
          deliverAs: "followUp",
          triggerTurn: true,
        },
      );
    } catch (error) {
      // Query failed, skip diagnostics.
      void error;
    }
  });
}
