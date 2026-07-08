import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  configLoader,
  NVIM_CONFIG_UPDATED_EVENT,
  NVIM_EXTENSIONS_REGISTER_EVENT,
  NVIM_EXTENSIONS_REQUEST_EVENT,
  type NvimConfigUpdatedPayload,
} from "../nvim/config";
import { registerUndoTreeCommand } from "./commands";
import { registerHooks } from "./hooks";

export default async function undoExtension(pi: ExtensionAPI): Promise<void> {
  await configLoader.load();

  let enabled = configLoader.getConfig().undo.enabled;

  registerHooks(pi, () => enabled);

  function registerFeature(): void {
    pi.events.emit(NVIM_EXTENSIONS_REGISTER_EVENT, { feature: "undo" });
  }

  registerFeature();
  registerUndoTreeCommand(pi);

  pi.events.on(NVIM_EXTENSIONS_REQUEST_EVENT, registerFeature);

  pi.events.on(NVIM_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NvimConfigUpdatedPayload).config.undo.enabled;
  });
}
