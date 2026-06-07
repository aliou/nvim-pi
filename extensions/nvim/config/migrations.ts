import type { Migration } from "@aliou/pi-utils-settings";
import type { NvimConfig } from "./types";

// ---------------------------------------------------------------------------
// Migration message queue
// ---------------------------------------------------------------------------

const migrationMessages: string[] = [];

export function drainMigrationMessages(): string[] {
  return migrationMessages.splice(0);
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

export const migrations: Migration<NvimConfig>[] = [
  {
    name: "nest-nvim-settings",
    shouldRun: (config) =>
      "showConnectionMessages" in
      (config as NvimConfig & { showConnectionMessages?: boolean }),
    run: (config) => {
      const legacy = config as NvimConfig & {
        showConnectionMessages?: boolean;
      };
      const migrated: NvimConfig = {
        ...config,
        nvim: {
          ...config.nvim,
          showConnectionMessages: legacy.showConnectionMessages,
        },
      };
      delete (migrated as NvimConfig & { showConnectionMessages?: boolean })
        .showConnectionMessages;
      return migrated;
    },
  },
  {
    name: "add-inject-editor-state",
    shouldRun: (config) => config.nvim?.injectEditorState === undefined,
    run: (config) => {
      const migrated = structuredClone(config);
      migrated.nvim = {
        ...migrated.nvim,
        injectEditorState: false,
      };
      migrationMessages.push(
        "New setting `injectEditorState` added (default: off). Enable it in `/neovim:settings` to inject editor state into each prompt.",
      );
      return migrated;
    },
  },
];
