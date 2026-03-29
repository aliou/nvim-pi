import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerNeovimSettings } from "./settings";

export function registerCommands(pi: ExtensionAPI): void {
  registerNeovimSettings(pi);
}
