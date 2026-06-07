import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { ResolvedNvimConfig } from "../config";
import type { NvimConnectionState } from "../connection";
import { registerNvimContextHook } from "./nvim-context";

export type { NvimConnectionState } from "../connection";

export function setupNvimHooks(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  registerNvimContextHook(pi, state, getConfig);
}
