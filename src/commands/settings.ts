import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  type NvimConfig,
  type ResolvedNvimConfig,
} from "../config";

export function registerNeovimSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<NvimConfig, ResolvedNvimConfig>(pi, {
    commandName: "neovim:settings",
    commandDescription: "Configure Neovim integration settings",
    title: "Neovim Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: NvimConfig | null,
      resolved: ResolvedNvimConfig,
    ): SettingsSection[] => {
      const showMessages =
        tabConfig?.showConnectionMessages ?? resolved.showConnectionMessages;

      return [
        {
          label: "Connection",
          items: [
            {
              id: "showConnectionMessages",
              label: "Connection status messages",
              description:
                "Show Neovim connection status messages in chat (connected/disconnected/no instance/multiple instances).",
              currentValue: showMessages ? "on" : "off",
              values: ["on", "off"],
            },
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config): NvimConfig | null => {
      if (id !== "showConnectionMessages") return null;
      const updated = structuredClone(config);
      updated.showConnectionMessages = newValue === "on";
      return updated;
    },
  });
}
