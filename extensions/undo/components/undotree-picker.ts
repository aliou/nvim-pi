import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { Panel, StatusLine } from "@aliou/pi-utils-ui";
import {
  getSelectListTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Input,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  type TUI,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { getUndoFilePath } from "../../../src/undo";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

export type UndoTreePickerItem = {
  path: string;
  label: string;
};

export async function collectUndoTreePickerItems(
  cwd: string,
): Promise<UndoTreePickerItem[]> {
  const results: UndoTreePickerItem[] = [];
  const pending = [cwd];

  while (pending.length > 0 && results.length < 1000) {
    const directory = pending.pop();
    if (!directory) break;

    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) pending.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;

      const undoPath = await getUndoFilePath(absolutePath);
      const hasUndo = await stat(undoPath)
        .then(() => true)
        .catch(() => false);
      if (!hasUndo) continue;

      results.push({
        path: absolutePath,
        label: relative(cwd, absolutePath) || absolutePath,
      });
      if (results.length >= 1000) break;
    }
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}

function fuzzyScore(text: string, query: string): number | null {
  if (query.length === 0) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let position = -1;
  let score = 0;

  for (const char of needle) {
    const next = haystack.indexOf(char, position + 1);
    if (next === -1) return null;
    score += next === position + 1 ? 1 : next - position;
    position = next;
  }

  return score;
}

export type UndoTreePickerOptions = {
  tui: TUI;
  theme: Theme;
  items: UndoTreePickerItem[];
  onDone: (path: string | undefined) => void;
};

export class UndoTreePicker implements Component {
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly sourceItems: UndoTreePickerItem[];
  private readonly onDone: (path: string | undefined) => void;
  private readonly input = new Input();
  private list: SelectList;

  constructor(options: UndoTreePickerOptions) {
    this.tui = options.tui;
    this.theme = options.theme;
    this.sourceItems = options.items;
    this.onDone = options.onDone;
    this.input.focused = true;
    this.input.onSubmit = () => this.openSelected();
    this.input.onEscape = () => this.onDone(undefined);
    this.list = this.createList("");
  }

  render(width: number): string[] {
    const footer = new StatusLine({
      left: ["type fuzzy query", "↑/↓ move", "enter open", "esc close"],
      style: (text: string) => this.theme.fg("dim", text),
    });
    const body = {
      render: (bodyWidth: number) => [
        this.theme.fg("dim", "Search"),
        ...this.input.render(bodyWidth),
        "",
        ...this.list.render(bodyWidth),
      ],
      invalidate: () => {
        this.input.invalidate();
        this.list.invalidate();
      },
    } satisfies Component;

    return new Panel({
      title: "Open undo history",
      body,
      footer,
      border: "round",
      padding: 1,
      borderStyle: (text: string) => this.theme.fg("border", text),
      titleStyle: (text: string) =>
        this.theme.fg("accent", this.theme.bold(text)),
    }).render(width);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.onDone(undefined);
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      this.list.handleInput(data);
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      this.openSelected();
      return;
    }

    const before = this.input.getValue();
    this.input.handleInput(data);
    const after = this.input.getValue();
    if (after !== before) {
      this.list = this.createList(after);
    }
    this.tui.requestRender();
  }

  invalidate(): void {
    this.input.invalidate();
    this.list.invalidate();
  }

  private createList(query: string): SelectList {
    const items: SelectItem[] = this.sourceItems
      .map((item) => ({ item, score: fuzzyScore(item.label, query) }))
      .filter(
        (entry): entry is { item: UndoTreePickerItem; score: number } =>
          entry.score !== null,
      )
      .sort(
        (a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label),
      )
      .slice(0, 100)
      .map(({ item }) => ({
        value: item.path,
        label: item.label,
        description: "undo history",
      }));

    const list = new SelectList(items, 12, getSelectListTheme(), {
      minPrimaryColumnWidth: 24,
      truncatePrimary: ({ text, maxWidth }) =>
        truncateToWidth(text, maxWidth, "…", true),
    });
    list.onSelect = (item) => this.onDone(item.value);
    list.onCancel = () => this.onDone(undefined);
    return list;
  }

  private openSelected(): void {
    const item = this.list.getSelectedItem();
    if (item) this.onDone(item.value);
  }
}
