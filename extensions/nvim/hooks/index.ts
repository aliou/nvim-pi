import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { ResolvedNvimConfig } from "../config";
import type { NvimConnectionState } from "../connection";
import { registerNvimContextHook } from "./nvim-context";
import { registerSystemPromptHook } from "./system-prompt";

export type { NvimConnectionState } from "../connection";

export function setupNvimHooks(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  registerSystemPromptHook(pi);
  registerNvimContextHook(pi, state, getConfig);
}
