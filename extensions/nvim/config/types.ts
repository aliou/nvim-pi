export type NvimFeatureId = "completion" | "undo";

export const NVIM_EXTENSIONS_REQUEST_EVENT =
  "neovim:extensions:request" as const;

export const NVIM_EXTENSIONS_REGISTER_EVENT =
  "neovim:extensions:register" as const;

export const NVIM_CONFIG_UPDATED_EVENT = "neovim:config:updated" as const;

export interface NvimExtensionsRegisterPayload {
  feature: NvimFeatureId;
}

export interface NvimConfigUpdatedPayload {
  config: ResolvedNvimConfig;
}

/** Settings for the main Neovim integration extension. */
export interface NvimCoreConfig {
  /** Show Neovim connection status messages in chat. */
  showConnectionMessages?: boolean;
  /** Inject current editor state (splits, cursor) into each prompt. */
  injectEditorState?: boolean;
}

/** Settings for the Vim-prefix autocomplete extension. */
export interface CompletionConfig {
  /** Enable autocomplete for open Neovim splits. */
  enabled?: boolean;
}

/** Settings for the persistent undo extension. */
export interface UndoConfig {
  /** Enable hooks that update Neovim persistent undo files after edit/write tools. */
  enabled?: boolean;
}

/** User-facing nvim-pi configuration. */
export interface NvimConfig {
  /** Main Neovim integration settings. */
  nvim?: NvimCoreConfig;
  /** Vim-prefix autocomplete extension settings. */
  completion?: CompletionConfig;
  /** Persistent undo extension settings. */
  undo?: UndoConfig;
}

export interface ResolvedNvimConfig {
  nvim: {
    showConnectionMessages: boolean;
    injectEditorState: boolean;
  };
  completion: {
    enabled: boolean;
  };
  undo: {
    enabled: boolean;
  };
}

export const DEFAULT_CONFIG: ResolvedNvimConfig = {
  nvim: {
    showConnectionMessages: true,
    injectEditorState: false,
  },
  completion: {
    enabled: true,
  },
  undo: {
    enabled: false,
  },
};
