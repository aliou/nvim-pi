import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ResolvedNvimConfig } from "../config";
import type { NvimConnectionState } from "../utils";
import { registerNvimContextHook } from "./nvim-context";
import { registerSystemPromptHook } from "./system-prompt";

export type { NvimConnectionState } from "../utils";

export function setupNvimHooks(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  registerSystemPromptHook(pi);
  registerNvimContextHook(pi, state, getConfig);
}
