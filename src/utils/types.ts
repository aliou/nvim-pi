/**
 * Shared Neovim RPC result types and helpers.
 */

import * as path from "node:path";

// ============================================================================
// Neovim RPC result types
// ============================================================================

export interface NvimContext {
  file: string;
  cursor: { line: number; col: number };
  selection?: {
    start: { line: number; col: number };
    end: { line: number; col: number };
    text: string;
  };
  filetype: string;
  modified: boolean;
}

export interface DiagnosticItem {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
}

export type DiagnosticsResult = DiagnosticItem[];

export interface CurrentFunctionResult {
  name: string;
  type: "function" | "method" | "class" | "module";
  start_line: number;
  end_line: number;
}

export interface SplitInfo {
  file: string;
  filetype: string;
  visible_range: { first: number; last: number };
  cursor?: { line: number; col: number };
  is_focused: boolean;
  modified: boolean;
}

export type SplitsResult = SplitInfo[];

export interface FileDiagnostic {
  line: number;
  col: number;
  message: string;
  source?: string;
}

export type DiagnosticsForFilesResult = Record<string, FileDiagnostic[]>;

// ============================================================================
// Tool details types
// ============================================================================

export type NvimContextAction =
  | "context"
  | "diagnostics"
  | "current_function"
  | "splits";

export type NvimResult =
  | NvimContext
  | DiagnosticsResult
  | CurrentFunctionResult
  | SplitsResult
  | null;

export interface NvimContextDetails {
  action: NvimContextAction;
  result: NvimResult;
  cwd: string;
  error?: string;
}

// ============================================================================
// RPC result type guards
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSplitInfo(value: unknown): value is SplitInfo {
  if (!isObject(value)) return false;
  return (
    typeof value.file === "string" &&
    typeof value.filetype === "string" &&
    typeof value.is_focused === "boolean" &&
    isObject(value.visible_range) &&
    typeof (value.visible_range as Record<string, unknown>).first ===
      "number" &&
    typeof (value.visible_range as Record<string, unknown>).last === "number"
  );
}

export function isSplitsResult(value: unknown): value is SplitsResult {
  return Array.isArray(value) && value.every(isSplitInfo);
}

export function isDiagnosticsForFilesResult(
  value: unknown,
): value is DiagnosticsForFilesResult {
  if (!isObject(value)) return false;
  return Object.values(value).every(
    (entries) =>
      Array.isArray(entries) &&
      entries.every(
        (entry) =>
          isObject(entry) &&
          typeof entry.line === "number" &&
          typeof entry.col === "number" &&
          typeof entry.message === "string",
      ),
  );
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Format a file path: relative if inside cwd, absolute otherwise.
 */
export function formatPath(filePath: string, cwd: string): string {
  if (!filePath) return "<no file>";

  const normalized = path.resolve(filePath);
  const normalizedCwd = path.resolve(cwd);

  if (normalized.startsWith(normalizedCwd + path.sep)) {
    return path.relative(cwd, normalized);
  }

  return normalized;
}

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
