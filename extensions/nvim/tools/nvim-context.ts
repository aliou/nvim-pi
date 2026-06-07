/**
 * Neovim Context Tool
 *
 * Query the connected Neovim editor for information:
 * - focused_buffer: current file, cursor position, selection, filetype
 * - diagnostics: LSP diagnostics for current buffer
 * - current_function: treesitter info about function/class at cursor
 * - splits: all visible splits with metadata
 */

import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  type AgentToolResult,
  defineTool,
  type ExtensionAPI,
  type Theme,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { formatPath } from "../../../src/format";
import { queryNvim } from "../../../src/nvim";
import type {
  CurrentFunctionResult,
  DiagnosticsResult,
  NvimFocusedBuffer,
  SplitsResult,
} from "../../../src/types";
import type { NvimConnectionState } from "../connection";
import { clearNvimSocket, resolveNvimSocket } from "../connection";
import type { NvimToolDetails } from "../types";
import { severityColor } from "../types";

// ============================================================================
// Tool parameters
// ============================================================================

const parameters = Type.Object({
  action: StringEnum(
    ["focused_buffer", "diagnostics", "current_function", "splits"] as const,
    {
      description: "The type of information to retrieve from Neovim",
    },
  ),
});

type NvimToolParams = Static<typeof parameters>;

// ============================================================================
// Tool registration
// ============================================================================

export function registerNvimContextTool(
  pi: ExtensionAPI,
  state: NvimConnectionState,
) {
  const tool = defineTool({
    name: "nvim_context",
    label: "Neovim Context",
    description: `Query the connected Neovim editor for information.

Available actions:
- "focused_buffer": current file, cursor position, selection, filetype (focused split only)
- "splits": all visible splits with metadata (file, filetype, visible lines, focused flag)
- "diagnostics": LSP diagnostics for current buffer
- "current_function": treesitter info about function/class at cursor

Use this tool when you need to know what the user is currently looking at in their editor.`,

    parameters,

    promptSnippet:
      "Query the connected Neovim editor (splits, diagnostics, focused buffer, current function)",

    promptGuidelines: [
      'Prefer nvim_context action="splits" when you need broad editor visibility.',
      'Use nvim_context action="focused_buffer" for the active file, cursor position, and selection.',
      'Use nvim_context action="diagnostics" after edits or when investigating errors.',
      'Use nvim_context action="current_function" to identify what function/class the cursor is in.',
      "Do not call nvim_context if editor state is irrelevant to the task.",
    ],

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await resolveNvimSocket(pi, ctx.cwd, state, {
        interactive: true,
        ui: {
          hasUI: ctx.hasUI,
          select: ctx.ui.select.bind(ctx.ui),
        },
      });

      if (result.error) {
        return {
          content: [{ type: "text", text: result.error }],
          details: {
            action: params.action,
            result: null,
            cwd: ctx.cwd,
            error: result.error,
          } satisfies NvimToolDetails,
        };
      }

      if (!result.socket) {
        return {
          content: [{ type: "text", text: "nvim: No instance available" }],
          details: {
            action: params.action,
            result: null,
            cwd: ctx.cwd,
            error: "No instance available",
          } satisfies NvimToolDetails,
        };
      }

      // Use socket to query Neovim
      try {
        const rawNvimResult = await queryNvim(
          pi.exec,
          result.socket,
          params.action,
          { signal },
        );
        const nvimResult = rawNvimResult as NvimToolDetails["result"];

        return {
          content: [
            { type: "text", text: JSON.stringify(nvimResult, null, 2) },
          ],
          details: {
            action: params.action,
            result: nvimResult,
            cwd: ctx.cwd,
          } satisfies NvimToolDetails,
        };
      } catch (err) {
        // If query fails, clear stored socket so we rediscover next time
        clearNvimSocket(state);

        const errorMsg = err instanceof Error ? err.message : String(err);
        let hint = "";
        if (errorMsg.includes("Timed out")) {
          hint =
            "\n\nHint: Neovim may be unresponsive. Check :PiNvimStatus in Neovim.";
        } else if (
          errorMsg.includes("ECONNREFUSED") ||
          errorMsg.includes("ENOENT")
        ) {
          hint =
            "\n\nHint: Neovim socket unavailable. Ensure Neovim is still running.";
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to query Neovim: ${errorMsg}${hint}`,
            },
          ],
          details: {
            action: params.action,
            result: null,
            cwd: ctx.cwd,
            error: errorMsg,
          } satisfies NvimToolDetails,
        };
      }
    },

    renderCall(args: NvimToolParams, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Neovim Context",
          action: args.action || "...",
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      // 1. Stable partial message
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Neovim Context: querying..."), 0, 0);
      }

      const rawDetails = result.details as Partial<NvimToolDetails> | undefined;

      // 2. Handle empty details from thrown errors (framework passes {})
      if (!rawDetails?.action) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Unknown error";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const details = rawDetails as NvimToolDetails;
      const { action, result: nvimResult, cwd } = details;

      const container = new Container();

      // 3. Error state
      if (details.error) {
        container.addChild(new Text(theme.fg("error", details.error), 0, 0));
        container.addChild(
          new ToolFooter(theme, {
            items: [
              { label: "action", value: action, tone: "accent" },
              { label: "status", value: "error", tone: "error" },
            ],
          }),
        );
        return container;
      }

      // 4. Build body fields and expanded content per action
      const fields: Array<{
        label: string;
        value: string;
        showCollapsed: boolean;
      }> = [];
      let expandedLines = "";

      switch (action) {
        case "focused_buffer": {
          const nvimBuf = nvimResult as NvimFocusedBuffer | null;
          if (!nvimBuf?.file) {
            fields.push({
              label: "Focused buffer",
              value: "No focused buffer available",
              showCollapsed: true,
            });
          } else {
            const filePath = formatPath(nvimBuf.file, cwd);
            const line = nvimBuf.cursor?.line ?? 1;
            const col = nvimBuf.cursor?.col ?? 1;
            let value = `${filePath}:${line}:${col}`;
            if (nvimBuf.filetype) value += ` (${nvimBuf.filetype})`;
            fields.push({ label: "File", value, showCollapsed: true });

            if (options.expanded && nvimBuf.selection) {
              const sel = nvimBuf.selection;
              expandedLines = `${theme.fg("muted", "Selection:")} ${theme.fg("dim", `${sel.start.line}:${sel.start.col} - ${sel.end.line}:${sel.end.col}`)}`;
              if (sel.text) {
                expandedLines += `\n${theme.fg("dim", sel.text)}`;
              }
            }
          }
          break;
        }

        case "diagnostics": {
          const diags = nvimResult as DiagnosticsResult | null;
          if (!diags || diags.length === 0) {
            fields.push({
              label: "Diagnostics",
              value: "No diagnostics",
              showCollapsed: true,
            });
          } else {
            const errors = diags.filter((d) => d.severity === "error").length;
            const warnings = diags.filter(
              (d) => d.severity === "warning",
            ).length;
            const others = diags.length - errors - warnings;

            const parts: string[] = [];
            if (errors > 0)
              parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
            if (warnings > 0)
              parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
            if (others > 0) parts.push(`${others} other`);
            fields.push({
              label: "Diagnostics",
              value: parts.join(", "),
              showCollapsed: true,
            });

            if (options.expanded) {
              const diagLines = diags.map((diag) => {
                const source = diag.source
                  ? theme.fg("dim", ` (${diag.source})`)
                  : "";
                return `${theme.fg("dim", `L${diag.line}:${diag.col}`)} ${theme.fg(severityColor(diag.severity), `[${diag.severity}]`)} ${theme.fg("muted", diag.message)}${source}`;
              });
              expandedLines = diagLines.join("\n");
            }
          }
          break;
        }

        case "current_function": {
          const fn = nvimResult as CurrentFunctionResult | null;
          if (!fn?.name) {
            fields.push({
              label: "Function",
              value: "No function at cursor",
              showCollapsed: true,
            });
          } else {
            fields.push({
              label: "Function",
              value: `${fn.name} (${fn.type})`,
              showCollapsed: true,
            });

            if (options.expanded) {
              expandedLines = theme.fg(
                "dim",
                `Lines ${fn.start_line}-${fn.end_line}`,
              );
            }
          }
          break;
        }

        case "splits": {
          const splits = nvimResult as SplitsResult | null;
          if (!splits || splits.length === 0) {
            fields.push({
              label: "Splits",
              value: "No visible splits",
              showCollapsed: true,
            });
          } else {
            const focusedCount = splits.filter((s) => s.is_focused).length;
            let value = `${splits.length} split${splits.length > 1 ? "s" : ""}`;
            if (focusedCount > 0) value += " (1 focused)";
            fields.push({ label: "Splits", value, showCollapsed: true });

            if (options.expanded) {
              const splitLines = splits.map((split) => {
                const filePath = formatPath(split.file, cwd);
                const marker = split.is_focused ? theme.fg("accent", " *") : "";
                const modified = split.modified
                  ? theme.fg("warning", " [+]")
                  : "";
                const range = theme.fg(
                  "dim",
                  `L${split.visible_range.first}-${split.visible_range.last}`,
                );
                let line = `${theme.fg("muted", filePath)}${marker}${modified} ${range}`;
                if (split.is_focused && split.cursor) {
                  line += theme.fg(
                    "dim",
                    ` cursor ${split.cursor.line}:${split.cursor.col}`,
                  );
                }
                return line;
              });
              expandedLines = splitLines.join("\n");
            }
          }
          break;
        }

        default:
          fields.push({
            label: "Result",
            value: JSON.stringify(nvimResult, null, 2),
            showCollapsed: true,
          });
      }

      container.addChild(new ToolBody({ fields }, options, theme));

      if (options.expanded && expandedLines) {
        container.addChild(new Text(expandedLines, 0, 0));
      }

      return container;
    },
  });

  pi.registerTool(tool);
}
