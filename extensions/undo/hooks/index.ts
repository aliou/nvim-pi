import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type EditToolCallEvent,
  type ExtensionAPI,
  isToolCallEventType,
  type ToolCallEvent,
  type WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { updateUndofileForExternalWrite } from "../../../src/undo";

type UndoSnapshot = {
  filePath: string;
  oldContent: string;
};

const undoableTools = new Set(["edit", "write"]);

const isUndoableTool = (
  evt: ToolCallEvent,
): evt is EditToolCallEvent | WriteToolCallEvent =>
  isToolCallEventType("edit", evt) || isToolCallEventType("write", evt);

export function registerHooks(
  pi: ExtensionAPI,
  isEnabled: () => boolean,
): void {
  const snapshots = new Map<string, UndoSnapshot>();

  pi.on("tool_call", async (event, ctx) => {
    if (!isEnabled() || !isUndoableTool(event)) return;

    const input = event.input;
    if (typeof input.path !== "string") return;

    const filePath = resolve(ctx.cwd, input.path);
    const oldContent = await readFile(filePath, "utf8").catch(() => undefined);
    if (oldContent === undefined) return;

    snapshots.set(event.toolCallId, { filePath, oldContent });
  });

  pi.on("tool_result", async (event) => {
    if (!isEnabled() || !undoableTools.has(event.toolName)) return;

    const snapshot = snapshots.get(event.toolCallId);
    snapshots.delete(event.toolCallId);

    if (!snapshot || event.isError) return;

    const newContent = await readFile(snapshot.filePath, "utf8").catch(
      () => undefined,
    );
    if (newContent === undefined) return;

    await updateUndofileForExternalWrite({
      filePath: snapshot.filePath,
      oldContent: snapshot.oldContent,
      newContent,
    });
  });
}
