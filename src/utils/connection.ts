/**
 * Shared Neovim connection resolution.
 *
 * Centralizes discovery, selection, and caching of the Neovim socket so both
 * hooks and tools use identical logic.
 */

import { existsSync } from "node:fs";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  type DiscoveredInstance,
  discoverNvim,
  type ExecFn,
  queryNvim,
} from "../nvim";

// ============================================================================
// Types
// ============================================================================

export interface NvimConnectionState {
  socket: string | null;
  lockfile: string | null;
  modifiedFilesThisTurn: Set<string>;
}

interface InstanceInfo {
  instance: DiscoveredInstance;
  label: string;
}

export interface ResolveSocketResult {
  socket: string | null;
  error?: string;
}

interface ResolveOptions {
  /** Whether to prompt the user when multiple instances are found. */
  interactive: boolean;
  /** UI methods for prompting. Only needed when interactive is true. */
  ui?: {
    hasUI: boolean;
    select: (title: string, options: string[]) => Promise<string | undefined>;
  };
}

// ============================================================================
// Helpers
// ============================================================================

async function getInstanceInfo(
  exec: ExecFn,
  instance: DiscoveredInstance,
): Promise<InstanceInfo> {
  try {
    const result = await queryNvim(exec, instance.lockfile.socket, "context", {
      timeout: 1000,
    });
    const ctx = result as {
      file?: string;
      cursor?: { line: number };
      filetype?: string;
    } | null;

    if (ctx?.file) {
      const filename = ctx.file.split("/").pop() ?? ctx.file;
      const pos = ctx.cursor ? `:${ctx.cursor.line}` : "";
      return {
        instance,
        label: `${filename}${pos}${ctx.filetype ? ` (${ctx.filetype})` : ""}`,
      };
    }
  } catch {
    // Query failed, fall back to basic info
  }

  return {
    instance,
    label: `[no file] PID ${instance.lockfile.pid}`,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve a Neovim socket, reusing the cached value when its lockfile still
 * exists. When multiple instances are discovered, prompts the user if
 * interactive is true. Updates state in place on success.
 */
export async function resolveNvimSocket(
  pi: ExtensionAPI,
  cwd: string,
  state: NvimConnectionState,
  opts: ResolveOptions,
): Promise<ResolveSocketResult> {
  // Check cached socket
  if (state.socket && state.lockfile && existsSync(state.lockfile)) {
    return { socket: state.socket };
  }

  // Discover instances
  const instances = discoverNvim(cwd);

  if (instances.length === 0) {
    return { socket: null, error: "No Neovim instance found" };
  }

  if (instances.length === 1) {
    const instance = instances[0];
    if (!instance) {
      return { socket: null, error: "No instance available" };
    }
    state.socket = instance.lockfile.socket;
    state.lockfile = instance.lockfilePath;
    return { socket: state.socket };
  }

  // Multiple instances
  if (!opts.interactive || !opts.ui?.hasUI) {
    return {
      socket: null,
      error: `Multiple Neovim instances found (${instances.length}). Cannot prompt in non-interactive mode.`,
    };
  }

  const infos = await Promise.all(
    instances.map((i) => getInstanceInfo(pi.exec, i)),
  );
  const options = infos.map((info) => info.label);

  const selected = await opts.ui.select(
    "Multiple Neovim instances found. Select one:",
    options,
  );

  if (!selected) {
    return { socket: null, error: "No Neovim instance selected" };
  }

  const index = options.indexOf(selected);
  const matchingInfo = infos[index];
  if (!matchingInfo) {
    return { socket: null, error: "Selected instance not found" };
  }

  state.socket = matchingInfo.instance.lockfile.socket;
  state.lockfile = matchingInfo.instance.lockfilePath;
  return { socket: state.socket };
}

/**
 * Clear the cached socket so the next resolution triggers rediscovery.
 */
export function clearNvimSocket(state: NvimConnectionState): void {
  state.socket = null;
  state.lockfile = null;
}
