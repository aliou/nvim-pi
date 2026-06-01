import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  EditToolInput,
  ExtensionAPI,
  WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import {
  createEditTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { updateUndofileForExternalWrite } from "../../src/undo";
import {
  configLoader,
  NVIM_CONFIG_UPDATED_EVENT,
  NVIM_EXTENSIONS_REGISTER_EVENT,
  NVIM_EXTENSIONS_REQUEST_EVENT,
  type NvimConfigUpdatedPayload,
} from "../nvim/config";

function registerUndoTools(pi: ExtensionAPI, isEnabled: () => boolean): void {
  const cwd = process.cwd();
  const nativeEdit = createEditTool(cwd);

  const nativeWrite = createWriteTool(cwd);

  pi.registerTool({
    ...nativeEdit,
    async execute(toolCallId, params, signal, onUpdate) {
      const { path } = params as EditToolInput;
      const absolutePath = resolve(cwd, path);
      const oldContent = await readFile(absolutePath, "utf8").catch(
        () => undefined,
      );

      const result = await nativeEdit.execute(
        toolCallId,
        params as EditToolInput,
        signal,
        onUpdate,
      );

      if (isEnabled() && oldContent !== undefined) {
        const newContent = await readFile(absolutePath, "utf8");
        await updateUndofileForExternalWrite({
          filePath: absolutePath,
          oldContent,
          newContent,
        });
      }

      return result;
    },
  });

  pi.registerTool({
    ...nativeWrite,
    async execute(toolCallId, params, signal, onUpdate) {
      const { path, content } = params as WriteToolInput;
      const absolutePath = resolve(cwd, path);
      const oldContent = await readFile(absolutePath, "utf8").catch(
        () => undefined,
      );

      const result = await nativeWrite.execute(
        toolCallId,
        params as WriteToolInput,
        signal,
        onUpdate,
      );

      if (isEnabled() && oldContent !== undefined) {
        await updateUndofileForExternalWrite({
          filePath: absolutePath,
          oldContent,
          newContent: content,
        });
      }

      return result;
    },
  });
}

export default async function undoExtension(pi: ExtensionAPI): Promise<void> {
  await configLoader.load();

  let enabled = configLoader.getConfig().undoTools;
  let registered = false;

  function registerFeature(): void {
    pi.events.emit(NVIM_EXTENSIONS_REGISTER_EVENT, { feature: "undoTools" });
  }

  function syncRegistration(): void {
    if (!enabled || registered) return;
    registerUndoTools(pi, () => enabled);
    registered = true;
  }

  registerFeature();
  syncRegistration();

  pi.events.on(NVIM_EXTENSIONS_REQUEST_EVENT, registerFeature);

  pi.events.on(NVIM_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NvimConfigUpdatedPayload).config.undoTools;
    syncRegistration();
  });
}
