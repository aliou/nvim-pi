import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerNeovimSettings } from "./settings";

export function registerCommands(pi: ExtensionAPI): void {
  registerNeovimSettings(pi);
}
