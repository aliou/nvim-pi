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
        tabConfig?.nvim?.showConnectionMessages ??
        resolved.nvim.showConnectionMessages;
      const injectEditorState =
        tabConfig?.nvim?.injectEditorState ?? resolved.nvim.injectEditorState;
      const completionEnabled =
        tabConfig?.completion?.enabled ?? resolved.completion.enabled;
      const undoEnabled = tabConfig?.undo?.enabled ?? resolved.undo.enabled;

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
            {
              id: "injectEditorState",
              label: "Editor state injection",
              description:
                "Inject current Neovim editor state (open splits, cursor position) into each prompt automatically.",
              currentValue: injectEditorState ? "on" : "off",
              values: ["on", "off"],
            },
          ],
        },
        {
          label: "Extensions",
          items: [
            featureRow(
              "completion",
              "@vim: autocomplete",
              "Toggle the @vim: autocomplete provider for open Neovim splits",
              completionEnabled,
              loaded.has("completion"),
            ),
            featureRow(
              "undo",
              "Persistent undo tools",
              "Toggle hooks that update Neovim persistent undo files after edit/write tool calls",
              undoEnabled,
              loaded.has("undo"),
            ),
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config): NvimConfig | null => {
      if (
        (id === "completion" || id === "undo") &&
        !getLoadedFeatures().has(id)
      ) {
        return null;
      }

      const updated = structuredClone(config);

      switch (id) {
        case "showConnectionMessages":
          updated.nvim = {
            ...updated.nvim,
            showConnectionMessages: newValue === "on",
          };
          return updated;
        case "injectEditorState":
          updated.nvim = {
            ...updated.nvim,
            injectEditorState: newValue === "on",
          };
          return updated;
        case "completion":
          updated.completion = {
            ...updated.completion,
            enabled: newValue === "enabled",
          };
          return updated;
        case "undo":
          updated.undo = {
            ...updated.undo,
            enabled: newValue === "enabled",
          };
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
