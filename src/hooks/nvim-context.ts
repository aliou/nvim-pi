/**
 * Neovim Context Hook
 *
 * Lifecycle events:
 * - session_start: auto-connects to Neovim instance
 * - before_agent_start: injects editor context (splits, cursor position)
 * - tool_result: reloads files in Neovim when write/edit tools complete
 * - turn_end: sends LSP errors for modified files
 */

import * as path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ResolvedNvimConfig } from "../config";
import { discoverNvim, queryNvim } from "../nvim";
import {
  clearNvimSocket,
  formatPath,
  isDiagnosticsForFilesResult,
  isSplitsResult,
  type NvimConnectionState,
  resolveNvimSocket,
  type SplitInfo,
} from "../utils";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format splits info into a human-readable context string for the system
 * prompt.
 */
function formatSplitsContext(splits: SplitInfo[], cwd: string): string {
  if (splits.length === 0) {
    return "No files are currently open in the editor.";
  }

  const lines: string[] = ["Current editor state:"];

  for (const split of splits) {
    const filePath = formatPath(split.file, cwd);
    const marker = split.is_focused ? " [focused]" : "";
    const modified = split.modified ? " [modified]" : "";

    let line = `- ${filePath}${marker}${modified}`;
    line += ` (${split.filetype || "unknown"})`;
    line += ` visible lines ${split.visible_range.first}-${split.visible_range.last}`;

    if (split.is_focused && split.cursor) {
      line += `, cursor at line ${split.cursor.line}:${split.cursor.col}`;
    }

    lines.push(line);
  }

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

export type { NvimConnectionState } from "../utils";

export function registerNvimContextHook(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  const shouldShowConnectionMessages = () => getConfig().showConnectionMessages;

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
        pi.sendMessage({
          customType: "nvim-connection",
          content: "nvim: no instance found",
          display: true,
          details: { status: "none" },
        });
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
    } catch {
      // Ignore notification failures
    }
  });

  // -------------------------------------------------------------------------
  // Before agent start: inject editor context into system prompt
  // -------------------------------------------------------------------------

  pi.on("before_agent_start", async (event, ctx) => {
    // Reset modified files tracking for new prompt
    state.modifiedFilesThisTurn = new Set();

    if (!state.socket) return;

    try {
      const raw = await queryNvim(pi.exec, state.socket, "splits", {
        timeout: 2000,
      });

      if (!isSplitsResult(raw) || raw.length === 0) {
        return;
      }

      const editorContext = formatSplitsContext(raw, ctx.cwd);

      return {
        systemPrompt: `${event.systemPrompt}\n\n${editorContext}`,
      };
    } catch {
      // Query failed, continue without context
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
        // Convert to absolute path for consistent tracking
        const absPath = path.resolve(ctx.cwd, filePath);
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
              { timeout: 2000 },
            );
          } catch {
            // Ignore reload failures
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
        { timeout: 3000 },
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
    } catch {
      // Query failed, skip diagnostics
    }
  });
}
