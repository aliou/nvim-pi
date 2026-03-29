/**
 * Neovim Context Tool
 *
 * Query the connected Neovim editor for context information:
 * - context: current file, cursor position, selection, filetype
 * - diagnostics: LSP diagnostics for current buffer
 * - current_function: treesitter info about function/class at cursor
 * - splits: all visible splits with metadata
 */

import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { queryNvim } from "../nvim";
import {
  type CurrentFunctionResult,
  clearNvimSocket,
  type DiagnosticsResult,
  formatPath,
  type NvimConnectionState,
  type NvimContext,
  type NvimContextDetails,
  type NvimResult,
  resolveNvimSocket,
  type SplitsResult,
  severityColor,
} from "../utils";

// ============================================================================
// Tool parameters
// ============================================================================

const NvimContextParams = Type.Object({
  action: StringEnum(
    ["context", "diagnostics", "current_function", "splits"] as const,
    {
      description: "The type of context to retrieve from Neovim",
    },
  ),
});

// ============================================================================
// Tool registration
// ============================================================================

export function registerNvimContextTool(
  pi: ExtensionAPI,
  state: NvimConnectionState,
) {
  pi.registerTool({
    name: "nvim_context",
    label: "Neovim Context",
    description: `Query the connected Neovim editor for context information.

Available actions:
- "context": current file, cursor position, selection, filetype (focused split only)
- "splits": all visible splits with metadata (file, filetype, visible lines, focused flag)
- "diagnostics": LSP diagnostics for current buffer
- "current_function": treesitter info about function/class at cursor

Use this tool when you need to know what the user is currently looking at in their editor.`,

    parameters: NvimContextParams,

    promptSnippet:
      "Query the connected Neovim editor for context (splits, diagnostics, cursor position, current function)",

    promptGuidelines: [
      'Prefer action="splits" when you need broad editor visibility.',
      'Use action="context" for focused file, cursor position, and selection.',
      'Use action="diagnostics" after edits or when investigating errors.',
      "Do not call this tool if editor context is irrelevant to the task.",
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
          } satisfies NvimContextDetails,
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
          } satisfies NvimContextDetails,
        };
      }

      // Use socket to query Neovim
      try {
        const nvimResult = (await queryNvim(
          pi.exec,
          result.socket,
          params.action,
          { signal },
        )) as NvimResult;

        return {
          content: [
            { type: "text", text: JSON.stringify(nvimResult, null, 2) },
          ],
          details: {
            action: params.action,
            result: nvimResult,
            cwd: ctx.cwd,
          } satisfies NvimContextDetails,
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
          } satisfies NvimContextDetails,
        };
      }
    },

    renderCall(args: { action?: string }, theme: Theme) {
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
      if (options.isPartial) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const rawDetails = result.details as
        | Partial<NvimContextDetails>
        | undefined;

      // Handle empty details from thrown errors (framework passes {})
      if (!rawDetails?.action) {
        const text = result.content[0];
        const msg = text?.type === "text" ? text.text : "Unknown error";
        return new Text(theme.fg("error", msg), 0, 0);
      }
      const details = rawDetails as NvimContextDetails;
      const { action, result: nvimResult, cwd } = details;
      let content = "";

      if (details.error) {
        content = theme.fg("error", details.error);
      } else {
        switch (action) {
          case "context": {
            const nvimCtx = nvimResult as NvimContext | null;
            if (!nvimCtx?.file) {
              content = theme.fg("dim", "No context available");
              break;
            }

            const filePath = formatPath(nvimCtx.file, cwd);
            const line = nvimCtx.cursor?.line ?? 1;
            const col = nvimCtx.cursor?.col ?? 1;

            content =
              theme.fg("accent", filePath) + theme.fg("dim", `:${line}:${col}`);
            if (nvimCtx.filetype) {
              content += theme.fg("muted", ` (${nvimCtx.filetype})`);
            }

            if (options.expanded && nvimCtx.selection) {
              const sel = nvimCtx.selection;
              content += `\n${theme.fg("muted", "Selection: ")}`;
              content += theme.fg(
                "dim",
                `${sel.start.line}:${sel.start.col} - ${sel.end.line}:${sel.end.col}`,
              );
              if (sel.text) {
                content += `\n${theme.fg("dim", sel.text)}`;
              }
            }
            break;
          }

          case "diagnostics": {
            const diags = nvimResult as DiagnosticsResult | null;
            if (!diags || diags.length === 0) {
              content = theme.fg("success", "No diagnostics");
              break;
            }

            const errors = diags.filter(
              (diag) => diag.severity === "error",
            ).length;
            const warnings = diags.filter(
              (diag) => diag.severity === "warning",
            ).length;
            const others = diags.length - errors - warnings;

            const parts: string[] = [];
            if (errors > 0) {
              parts.push(
                theme.fg("error", `${errors} error${errors > 1 ? "s" : ""}`),
              );
            }
            if (warnings > 0) {
              parts.push(
                theme.fg(
                  "warning",
                  `${warnings} warning${warnings > 1 ? "s" : ""}`,
                ),
              );
            }
            if (others > 0) {
              parts.push(theme.fg("dim", `${others} other`));
            }
            content = parts.join(", ");

            if (options.expanded) {
              for (const diag of diags) {
                content += `\n${theme.fg("dim", `L${diag.line}:${diag.col}`)} `;
                content += theme.fg(
                  severityColor(diag.severity),
                  `[${diag.severity}]`,
                );
                content += ` ${theme.fg("muted", diag.message)}`;
                if (diag.source) {
                  content += theme.fg("dim", ` (${diag.source})`);
                }
              }
            }
            break;
          }

          case "current_function": {
            const fn = nvimResult as CurrentFunctionResult | null;
            if (!fn?.name) {
              content = theme.fg("dim", "No function at cursor");
              break;
            }

            content =
              theme.fg("accent", fn.name) + theme.fg("muted", ` (${fn.type})`);
            if (options.expanded) {
              content += `\n${theme.fg("dim", `Lines ${fn.start_line}-${fn.end_line}`)}`;
            }
            break;
          }

          case "splits": {
            const splits = nvimResult as SplitsResult | null;
            if (!splits || splits.length === 0) {
              content = theme.fg("dim", "No visible splits");
              break;
            }

            const focusedCount = splits.filter(
              (split) => split.is_focused,
            ).length;
            content = theme.fg(
              "accent",
              `${splits.length} split${splits.length > 1 ? "s" : ""}`,
            );
            if (focusedCount > 0) {
              content += theme.fg("dim", " (1 focused)");
            }

            if (options.expanded) {
              for (const split of splits) {
                const filePath = formatPath(split.file, cwd);
                const marker = split.is_focused ? theme.fg("accent", " *") : "";
                const modified = split.modified
                  ? theme.fg("warning", " [+]")
                  : "";
                content += `\n${theme.fg("muted", filePath)}${marker}${modified}`;
                content += theme.fg(
                  "dim",
                  ` L${split.visible_range.first}-${split.visible_range.last}`,
                );
                if (split.is_focused && split.cursor) {
                  content += theme.fg(
                    "dim",
                    ` cursor ${split.cursor.line}:${split.cursor.col}`,
                  );
                }
              }
            }
            break;
          }

          default:
            content = theme.fg("dim", JSON.stringify(nvimResult, null, 2));
        }
      }

      return new ToolBody(
        {
          fields: [new Text(content, 0, 0)],
          footer: new ToolFooter(theme, {
            items: [
              { label: "action", value: action, tone: "accent" },
              {
                label: "status",
                value: details.error ? "error" : "ok",
                tone: details.error ? "error" : "success",
              },
            ],
          }),
        },
        options,
        theme,
      );
    },
  });
}
