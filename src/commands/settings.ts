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
      const follow = tabConfig?.follow ?? resolved.follow;

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
        {
          label: "Follow",
          items: [
            {
              id: "follow",
              label: "Follow file activity",
              description:
                "When enabled, Neovim follows agent reads and writes by jumping to the file and briefly highlighting the affected lines.",
              currentValue: follow ? "on" : "off",
              values: ["on", "off"],
            },
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config): NvimConfig | null => {
      const updated = structuredClone(config);

      if (id === "showConnectionMessages") {
        updated.showConnectionMessages = newValue === "on";
        return updated;
      }

      if (id === "follow") {
        updated.follow = newValue === "on";
        return updated;
      }

      return null;
    },
  });
}
