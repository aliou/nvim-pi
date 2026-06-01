import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { NvimFeatureId } from "../config";
import { registerNeovimSettings } from "./settings";

export interface RegisterCommandsOptions {
  getLoadedFeatures: () => Set<NvimFeatureId>;
}

export function registerCommands(
  pi: ExtensionAPI,
  options: RegisterCommandsOptions,
): void {
  registerNeovimSettings(pi, options);
}
