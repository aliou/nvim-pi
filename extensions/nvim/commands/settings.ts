import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  configLoader,
  emitNvimConfigUpdated,
  type NvimConfig,
  type NvimFeatureId,
  type ResolvedNvimConfig,
} from "../config";

export interface RegisterNeovimSettingsOptions {
  getLoadedFeatures: () => Set<NvimFeatureId>;
}

function featureRow(
  id: NvimFeatureId,
  label: string,
  description: string,
  configValue: boolean,
  isLoaded: boolean,
): SettingItem {
  if (isLoaded) {
    return {
      id,
      label,
      description,
      currentValue: configValue ? "enabled" : "disabled",
      values: ["enabled", "disabled"],
    };
  }

  return {
    id,
    label,
    description: `${description} (Not loaded by Pi)`,
    currentValue: "unavailable",
    values: [],
  };
}

export function registerNeovimSettings(
  pi: ExtensionAPI,
  options: RegisterNeovimSettingsOptions,
): void {
  const { getLoadedFeatures } = options;

  registerSettingsCommand<NvimConfig, ResolvedNvimConfig>(pi, {
    commandName: "neovim:settings",
    commandDescription: "Configure Neovim integration settings",
    title: "Neovim Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: NvimConfig | null,
      resolved: ResolvedNvimConfig,
    ): SettingsSection[] => {
      const loaded = getLoadedFeatures();
      const showMessages =
        tabConfig?.showConnectionMessages ?? resolved.showConnectionMessages;
      const splitsAutocomplete =
        tabConfig?.splitsAutocomplete ?? resolved.splitsAutocomplete;
      const undoTools = tabConfig?.undoTools ?? resolved.undoTools;

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
          label: "Extensions",
          items: [
            featureRow(
              "splitsAutocomplete",
              "@vim: autocomplete",
              "Toggle the @vim: autocomplete provider for open Neovim splits",
              splitsAutocomplete,
              loaded.has("splitsAutocomplete"),
            ),
            featureRow(
              "undoTools",
              "Persistent undo tools",
              "Toggle edit/write tool wrappers that update Neovim persistent undo files",
              undoTools,
              loaded.has("undoTools"),
            ),
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config): NvimConfig | null => {
      if (
        (id === "splitsAutocomplete" || id === "undoTools") &&
        !getLoadedFeatures().has(id)
      ) {
        return null;
      }

      const updated = structuredClone(config);

      switch (id) {
        case "showConnectionMessages":
          updated.showConnectionMessages = newValue === "on";
          return updated;
        case "splitsAutocomplete":
          updated.splitsAutocomplete = newValue === "enabled";
          return updated;
        case "undoTools":
          updated.undoTools = newValue === "enabled";
          return updated;
        default:
          return null;
      }
    },
    onSave: async () => {
      emitNvimConfigUpdated(pi);
    },
  });
}
