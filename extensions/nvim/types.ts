/**
 * Extension-local types for the main nvim extension.
 *
 * Tool/result-detail types that depend on Pi extension concepts.
 * Core Neovim domain types live in src/types.ts.
 */

import type {
  CurrentFunctionResult,
  DiagnosticsResult,
  NvimFocusedBuffer,
  SplitsResult,
} from "../../src/types";

// ============================================================================
// Tool detail types
// ============================================================================

export type NvimQueryAction =
  | "focused_buffer"
  | "diagnostics"
  | "current_function"
  | "splits";

export type NvimResult =
  | NvimFocusedBuffer
  | DiagnosticsResult
  | CurrentFunctionResult
  | SplitsResult
  | null;

export interface NvimToolDetails {
  action: NvimQueryAction;
  result: NvimResult;
  cwd: string;
  error?: string;
}

// ============================================================================
// Presentation helpers
// ============================================================================

import type { DiagnosticItem } from "../../src/types";

/**
 * Map diagnostic severity to a theme color name.
 */
export function severityColor(
  severity: DiagnosticItem["severity"],
): "error" | "warning" | "dim" {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    default:
      return "dim";
  }
}
