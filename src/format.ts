/**
 * Shared formatting helpers.
 */

import * as path from "node:path";

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
