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

import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";

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

async function sendFollowEvent(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  payload:
    | {
        kind: "read";
        path: string;
        offset?: number;
        limit?: number;
      }
    | {
        kind: "edit";
        path: string;
        firstChangedLine?: number;
      }
    | {
        kind: "write";
        path: string;
      },
): Promise<void> {
  if (!state.socket) return;

  try {
    await queryNvim(pi.exec, state.socket, {
      type: "follow_event",
      ...payload,
    });
  } catch {
    // Ignore follow failures
  }
}

function isFollowEnabled(getConfig: () => ResolvedNvimConfig): boolean {
  return getConfig().follow;
}

function getAbsolutePath(cwd: string, filePath: string): string {
  return path.resolve(cwd, filePath);
}

function getEditFirstChangedLine(event: ToolResultEvent): number | undefined {
  if (event.toolName !== "edit") return undefined;

  const details = event.details as { firstChangedLine?: number } | undefined;
  return details?.firstChangedLine;
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
  // Tool call/result: follow reads, reload writes/edits, track modifications
  // -------------------------------------------------------------------------

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    if (!isFollowEnabled(getConfig)) return;
    if (!state.socket) return;

    if (event.toolName !== "read") return;

    const filePath = event.input?.path;
    if (typeof filePath !== "string") return;

    await sendFollowEvent(pi, state, {
      kind: "read",
      path: getAbsolutePath(ctx.cwd, filePath),
      offset:
        typeof event.input.offset === "number" ? event.input.offset : undefined,
      limit:
        typeof event.input.limit === "number" ? event.input.limit : undefined,
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input?.path as string | undefined;
      if (filePath && !event.isError) {
        const absPath = getAbsolutePath(ctx.cwd, filePath);
        state.modifiedFilesThisTurn.add(absPath);

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

        if (isFollowEnabled(getConfig)) {
          if (event.toolName === "edit") {
            await sendFollowEvent(pi, state, {
              kind: "edit",
              path: absPath,
              firstChangedLine: getEditFirstChangedLine(event),
            });
          } else {
            await sendFollowEvent(pi, state, {
              kind: "write",
              path: absPath,
            });
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
