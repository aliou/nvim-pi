import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { updateUndofileForExternalWrite } from "../../../src/undo";
import {
  NVIM_UNDO_REGISTER_TOOL_EVENT,
  NVIM_UNDO_REQUEST_TOOLS_EVENT,
  type NvimUndoPathResolver,
  type NvimUndoRegisteredTool,
} from "../types";

type UndoSnapshot = {
  filePath: string;
  oldContent: string;
};

const defaultResolvePaths: NvimUndoPathResolver = ({ input }) =>
  typeof input.path === "string" ? input.path : undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeRegistrations(data: unknown): NvimUndoRegisteredTool[] {
  const items = Array.isArray(data) ? data : [data];
  const result: NvimUndoRegisteredTool[] = [];

  for (const item of items) {
    if (typeof item === "string") {
      result.push({ toolName: item, resolvePaths: defaultResolvePaths });
      continue;
    }

    if (isObject(item) && typeof item.toolName === "string") {
      const resolvePaths =
        typeof item.resolvePaths === "function"
          ? (item.resolvePaths as NvimUndoPathResolver)
          : defaultResolvePaths;
      result.push({ toolName: item.toolName, resolvePaths });
    }
  }

  return result;
}

export function registerHooks(
  pi: ExtensionAPI,
  isEnabled: () => boolean,
): void {
  const snapshots = new Map<string, UndoSnapshot[]>();
  const undoableTools = new Map<string, NvimUndoPathResolver>([
    ["edit", defaultResolvePaths],
    ["write", defaultResolvePaths],
  ]);

  pi.events.on(NVIM_UNDO_REGISTER_TOOL_EVENT, (data) => {
    for (const registration of normalizeRegistrations(data)) {
      undoableTools.set(registration.toolName, registration.resolvePaths);
    }
  });

  pi.events.emit(NVIM_UNDO_REQUEST_TOOLS_EVENT, undefined);

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    if (!isEnabled()) return;

    const resolvePaths = undoableTools.get(event.toolName);
    if (!resolvePaths) return;

    const rawPaths = await resolvePaths({
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      input: event.input,
      cwd: ctx.cwd,
    });
    if (!rawPaths) return;

    const relativePaths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];
    const fileSnapshots: UndoSnapshot[] = [];

    for (const relativePath of relativePaths) {
      const filePath = resolve(ctx.cwd, relativePath);
      const oldContent = await readFile(filePath, "utf8").catch(
        () => undefined,
      );
      if (oldContent === undefined) continue;
      fileSnapshots.push({ filePath, oldContent });
    }

    if (fileSnapshots.length > 0) {
      snapshots.set(event.toolCallId, fileSnapshots);
    }
  });

  pi.on("tool_result", async (event: ToolResultEvent) => {
    if (!isEnabled()) return;

    const resolvePaths = undoableTools.get(event.toolName);
    if (!resolvePaths) return;

    const fileSnapshots = snapshots.get(event.toolCallId);
    snapshots.delete(event.toolCallId);

    if (!fileSnapshots || event.isError) return;

    for (const snapshot of fileSnapshots) {
      const newContent = await readFile(snapshot.filePath, "utf8").catch(
        () => undefined,
      );
      if (newContent === undefined) continue;

      await updateUndofileForExternalWrite({
        filePath: snapshot.filePath,
        oldContent: snapshot.oldContent,
        newContent,
      });
    }
  });
}
