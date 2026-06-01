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
import { updateUndofileForExternalWrite } from "../../../src/undo";

export function registerUndoTools(
  pi: ExtensionAPI,
  isEnabled: () => boolean,
): void {
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
