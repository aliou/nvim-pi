import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { NvimConnectionState } from "../utils";
import { registerNvimContextTool } from "./nvim-context";

export function setupNvimTools(pi: ExtensionAPI, state: NvimConnectionState) {
  registerNvimContextTool(pi, state);
}
