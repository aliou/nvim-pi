import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { getUndoFilePath, parseUndofile } from "../../../src/undo";
import type { UndoFile } from "../../../src/undo/types";
import { UndoTreeOverlay } from "../components/undotree-overlay";
import {
  collectUndoTreePickerItems,
  UndoTreePicker,
} from "../components/undotree-picker";

function resolveFilePath(cwd: string, input: string): string {
  const trimmed = input.trim();
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

function displayPath(cwd: string, filePath: string): string {
  const rel = relative(cwd, filePath);
  return rel.length > 0 && !rel.startsWith("..") ? rel : filePath;
}

async function completeFilePath(
  prefix: string,
): Promise<AutocompleteItem[] | null> {
  const cwd = process.cwd();
  const trimmed = prefix.trimStart();
  const absolutePrefix = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  const directory = trimmed.endsWith(sep)
    ? absolutePrefix
    : dirname(absolutePrefix);
  const basenamePrefix = trimmed.endsWith(sep)
    ? ""
    : (absolutePrefix.split(sep).pop() ?? "");

  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => null,
  );
  if (!entries) return null;

  const items = entries
    .filter((entry) => entry.name.startsWith(basenamePrefix))
    .slice(0, 50)
    .map((entry): AutocompleteItem => {
      const absoluteValue = join(directory, entry.name);
      const baseValue = isAbsolute(trimmed)
        ? absoluteValue
        : relative(cwd, absoluteValue);
      const value = baseValue + (entry.isDirectory() ? sep : "");
      return {
        value,
        label: entry.name + (entry.isDirectory() ? sep : ""),
        description: entry.isDirectory() ? "directory" : "file",
      };
    });

  return items.length > 0 ? items : null;
}

async function openUndoTreeForFile(params: {
  ctx: ExtensionCommandContext;
  rawPath: string;
}): Promise<void> {
  const { ctx, rawPath } = params;
  const filePath = resolveFilePath(ctx.cwd, rawPath);
  const undoFilePath = await getUndoFilePath(filePath);

  let undoBuffer: Buffer;
  try {
    undoBuffer = await readFile(undoFilePath);
  } catch {
    ctx.ui.notify(
      `nvim: No undofile found for ${displayPath(ctx.cwd, filePath)}`,
      "warning",
    );
    return;
  }

  let currentContent: string;
  try {
    currentContent = await readFile(filePath, "utf8");
  } catch {
    currentContent = "";
  }

  let undoFile: UndoFile;
  try {
    undoFile = parseUndofile(undoBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`nvim: Could not parse undofile: ${message}`, "error");
    return;
  }

  if (!ctx.hasUI) return;

  await ctx.ui.custom<"closed">(
    (tui, theme, _keybindings, done) =>
      new UndoTreeOverlay({
        tui,
        theme,
        filePath: displayPath(ctx.cwd, filePath),
        file: undoFile,
        currentContent,
        onClose: () => done("closed"),
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "90%",
        minWidth: 40,
        maxHeight: "85%",
        margin: 1,
        visible: () => true,
      },
    },
  );
}

async function pickUndoTreeFile(
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  if (!ctx.hasUI) return undefined;

  const items = await collectUndoTreePickerItems(ctx.cwd);
  return ctx.ui.custom<string | undefined>(
    (tui, theme, _keybindings, done) =>
      new UndoTreePicker({
        tui,
        theme,
        items,
        onDone: done,
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "70%",
        minWidth: 52,
        maxHeight: "70%",
        margin: 1,
        visible: (termWidth) => termWidth >= 50,
      },
    },
  );
}

export function registerUndoTreeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("neovim:undotree", {
    description: "Show the Neovim persistent undo tree for a file",
    getArgumentCompletions: completeFilePath,
    handler: async (args, ctx) => {
      const rawPath = args.trim();
      if (rawPath.length === 0) {
        const pickedPath = await pickUndoTreeFile(ctx);
        if (!pickedPath) return;
        await openUndoTreeForFile({ ctx, rawPath: pickedPath });
        return;
      }

      await openUndoTreeForFile({ ctx, rawPath });
    },
  });
}
