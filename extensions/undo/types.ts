export const NVIM_UNDO_REGISTER_TOOL_EVENT =
  "neovim:undo:register-tool" as const;

export const NVIM_UNDO_REQUEST_TOOLS_EVENT =
  "neovim:undo:request-tools" as const;

export type NvimUndoPathResolver = (args: {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  cwd: string;
}) => string | string[] | undefined | Promise<string | string[] | undefined>;

export type NvimUndoToolRegistration =
  | string
  | {
      toolName: string;
      resolvePaths?: NvimUndoPathResolver;
    };

export type NvimUndoRegisteredTool = {
  toolName: string;
  resolvePaths: NvimUndoPathResolver;
};
