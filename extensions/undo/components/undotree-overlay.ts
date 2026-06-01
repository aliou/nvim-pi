import { Panel, StatusLine } from "@aliou/pi-utils-ui";
import {
  getLanguageFromPath,
  highlightCode,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { UndoFile } from "../../../src/undo/types";
import {
  buildUndoTreeModel,
  type FlatUndoTreeNode,
  formatRelativeUndoTime,
  formatUndoTime,
  pickInitialUndoSeq,
  summarizeUndoDelta,
  type UndoTreeModel,
  type UndoTreeNodeModel,
} from "../lib/undotree-model";
import {
  buildUndoPreview,
  type PreviewMode,
  type UndoPreviewResult,
} from "../lib/undotree-preview";

const VIEWPORT_HEIGHT = 22;
const STACKED_BREAKPOINT = 84;
const MIN_USEFUL_WIDTH = 40;
const STACKED_TREE_HEIGHT = 10;
const STACKED_PREVIEW_HEIGHT = 16;
type FocusPane = "history" | "preview";

function padAnsi(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "…", true);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function sliceTreeLine(text: string, startCol: number, width: number): string {
  if (startCol <= 0) return text;

  let visibleCol = 0;
  let result = "";
  let activeAnsi = "";
  const escapeChar = String.fromCharCode(27);

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === escapeChar && text[index + 1] === "[") {
      let end = index + 2;
      while (end < text.length && !/[A-Za-z~]/.test(text[end] ?? "")) {
        end += 1;
      }
      if (end >= text.length) break;

      const sequence = text.slice(index, end + 1);
      const isReset =
        sequence.endsWith("m") && /\[(?:0|39|49)?m$/.test(sequence);
      activeAnsi = isReset ? "" : activeAnsi + sequence;
      if (visibleCol >= startCol && visibleCol < startCol + width) {
        result += sequence;
      }
      index = end;
      continue;
    }

    if (visibleCol >= startCol && visibleCol < startCol + width) {
      if (result.length === 0 && activeAnsi.length > 0) result += activeAnsi;
      result += text[index];
    }

    visibleCol += 1;
    if (visibleCol >= startCol + width) break;
  }

  return result.length > 0 ? `${result}\x1b[0m` : "";
}

class LinesViewport implements Component {
  constructor(private readonly lines: string[]) {}

  render(width: number): string[] {
    if (this.lines.length === 0) return ["No content."];
    return this.lines.map((line) => truncateToWidth(line, width, "…", true));
  }

  invalidate(): void {}
}

class SplitPane implements Component {
  constructor(
    private readonly left: Component,
    private readonly right: Component,
    private readonly leftWidth: number,
    private readonly separatorStyle: (text: string) => string,
  ) {}

  render(width: number): string[] {
    const rightWidth = Math.max(1, width - this.leftWidth - 3);
    const leftLines = this.left.render(this.leftWidth);
    const rightLines = this.right.render(rightWidth);
    const height = Math.max(leftLines.length, rightLines.length);
    const rows: string[] = [];

    for (let index = 0; index < height; index += 1) {
      rows.push(
        `${padAnsi(leftLines[index] ?? "", this.leftWidth)} ${this.separatorStyle("│")} ${rightLines[index] ?? ""}`,
      );
    }

    return rows;
  }

  invalidate(): void {
    this.left.invalidate();
    this.right.invalidate();
  }
}

export type UndoTreeOverlayOptions = {
  tui: TUI;
  theme: Theme;
  filePath: string;
  file: UndoFile;
  currentContent: string;
  onClose: () => void;
};

export class UndoTreeOverlay implements Component {
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly filePath: string;
  private readonly file: UndoFile;
  private readonly currentContent: string;
  private readonly model: UndoTreeModel;
  private readonly onClose: () => void;
  private selectedSeq: number;
  private focus: FocusPane = "history";
  private treeScroll = 0;
  private treeHorizontalScroll = 0;
  private previewScroll = 0;
  private previewMode: PreviewMode = "file";
  private cachedPreview: {
    seq: number;
    mode: PreviewMode;
    result: UndoPreviewResult;
  } | null = null;

  constructor(options: UndoTreeOverlayOptions) {
    this.tui = options.tui;
    this.theme = options.theme;
    this.filePath = options.filePath;
    this.file = options.file;
    this.currentContent = options.currentContent;
    this.onClose = options.onClose;
    this.model = buildUndoTreeModel(options.file);
    this.selectedSeq = pickInitialUndoSeq(options.file, this.model);
    this.ensureSelectedVisible();
    this.scrollPreviewToChange();
  }

  render(width: number): string[] {
    const title = `undo history — ${this.filePath}`;
    if (width < MIN_USEFUL_WIDTH) {
      return this.renderTooNarrow(width);
    }

    const preview = this.getPreview();
    const body =
      width < STACKED_BREAKPOINT
        ? new LinesViewport([
            ...this.renderTreeLines(width, STACKED_TREE_HEIGHT),
            this.theme.fg("borderMuted", "─".repeat(Math.max(1, width))),
            ...this.renderPreviewLines(preview, STACKED_PREVIEW_HEIGHT),
          ])
        : new SplitPane(
            new LinesViewport(this.renderTreeLines(this.getTreeWidth(width))),
            new LinesViewport(this.renderPreviewLines(preview)),
            this.getTreeWidth(width),
            (text) => this.theme.fg("borderMuted", text),
          );

    const selected = this.model.bySeq.get(this.selectedSeq);
    const footer = new StatusLine({
      left: [
        `focus ${this.focus}`,
        "tab focus",
        "j/k history",
        "↑/↓ preview",
        "d diff",
        "q close",
      ],
      right: selected
        ? [`change ${selected.seq}`, formatUndoTime(selected.time)]
        : [],
      style: (text: string) => this.theme.fg("dim", text),
    });

    const panel = new Panel({
      title,
      body,
      footer,
      border: "round",
      padding: 1,
      borderStyle: (text: string) => this.theme.fg("border", text),
      titleStyle: (text: string) =>
        this.theme.fg("accent", this.theme.bold(text)),
    });

    return panel.render(width);
  }

  private renderTooNarrow(width: number): string[] {
    const body = new LinesViewport([
      this.theme.fg("warning", "Undo history needs more room."),
      "",
      "Please make the terminal or overlay wider to view the history and preview.",
    ]);
    return new Panel({
      title: "undo history",
      body,
      border: "round",
      padding: 1,
      borderStyle: (text: string) => this.theme.fg("border", text),
      titleStyle: (text: string) =>
        this.theme.fg("accent", this.theme.bold(text)),
    }).render(width);
  }

  handleInput(data: string): void {
    if (
      data === "q" ||
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c"))
    ) {
      this.onClose();
      return;
    }

    if (matchesKey(data, Key.tab)) {
      this.focus = this.focus === "history" ? "preview" : "history";
    } else if (data === "d") {
      this.togglePreviewMode();
    } else if (this.focus === "history") {
      this.handleHistoryInput(data);
    } else if (this.focus === "preview") {
      this.handlePreviewInput(data);
    } else {
      return;
    }

    this.tui.requestRender();
  }

  invalidate(): void {}

  private handleHistoryInput(data: string): void {
    if (data === "j" || matchesKey(data, Key.down)) {
      this.moveSelection(1);
    } else if (data === "k" || matchesKey(data, Key.up)) {
      this.moveSelection(-1);
    } else if (data === "h") {
      this.selectParent();
    } else if (data === "l") {
      this.selectFirstChild();
    }
  }

  private handlePreviewInput(data: string): void {
    if (data === "j" || matchesKey(data, Key.down)) {
      this.scrollPreview(1);
    } else if (data === "k" || matchesKey(data, Key.up)) {
      this.scrollPreview(-1);
    } else if (matchesKey(data, Key.pageDown)) {
      this.scrollPreview(Math.floor(VIEWPORT_HEIGHT / 2));
    } else if (matchesKey(data, Key.pageUp)) {
      this.scrollPreview(-Math.floor(VIEWPORT_HEIGHT / 2));
    } else if (data === "g") {
      this.previewScroll = 0;
    } else if (data === "G") {
      this.scrollPreview(Number.MAX_SAFE_INTEGER);
    }
  }

  private renderTreeLines(width: number, height = VIEWPORT_HEIGHT): string[] {
    if (this.model.flat.length === 0) {
      return [
        this.theme.fg("warning", "No undo states recorded for this file."),
      ];
    }

    const lines = [
      this.focus === "history"
        ? this.theme.fg("accent", this.theme.bold("History"))
        : this.theme.fg("dim", "History"),
      "",
      ...this.renderTreeNodes(this.model.roots, ""),
    ];
    this.updateTreeHorizontalScroll(width);
    const sliced = lines
      .slice(this.treeScroll, this.treeScroll + height)
      .map((line) => sliceTreeLine(line, this.treeHorizontalScroll, width));
    return this.padViewport(sliced, height);
  }

  private renderTreeNodes(
    nodes: UndoTreeNodeModel[],
    prefix: string,
  ): string[] {
    const lines: string[] = [];
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const connector = isLast ? "└─" : "├─";
      lines.push(
        `${this.theme.fg("dim", prefix + connector)}${this.renderNodeLabel(node)}`,
      );
      const childPrefix = prefix + (isLast ? "  " : "│ ");
      lines.push(...this.renderTreeNodes(node.children, childPrefix));
    });
    return lines;
  }

  private renderNodeLabel(node: UndoTreeNodeModel): string {
    const isSelected = node.seq === this.selectedSeq;
    const isCurrent = node.seq === this.file.seqCur;
    const children = this.model.childrenBySeq.get(node.seq) ?? [];
    const marker = isSelected ? "▸" : isCurrent ? "●" : "○";
    const tags = [
      isCurrent ? "current" : null,
      children.length > 1 ? "branch" : null,
      !isCurrent && children.length === 0 ? "tip" : null,
    ].filter((tag): tag is string => tag !== null);
    const delta = this.colorDelta(summarizeUndoDelta(node.header));
    const pieces = [
      marker,
      formatRelativeUndoTime(node.header.time),
      delta,
      ...tags.map((tag) => this.theme.fg("dim", tag)),
    ];
    const label = pieces.join(" ");

    if (isSelected) {
      return this.theme.bg("selectedBg", this.theme.fg("text", label));
    }
    if (isCurrent) return this.theme.fg("accent", label);
    return label;
  }

  private colorDelta(delta: string): string {
    if (delta === "±0") return this.theme.fg("dim", delta);
    return delta
      .split(" ")
      .map((part) => {
        if (part.startsWith("+")) return this.theme.fg("success", part);
        if (part.startsWith("−") || part.startsWith("-")) {
          return this.theme.fg("error", part);
        }
        return part;
      })
      .join(" ");
  }

  private renderPreviewLines(
    preview: UndoPreviewResult,
    height = VIEWPORT_HEIGHT,
  ): string[] {
    const caption = this.renderPreviewCaption(preview);
    const highlighted = this.highlightPreview(preview);
    const above =
      this.previewScroll > 0
        ? [this.theme.fg("dim", `↑ ${this.previewScroll} above`)]
        : [];
    const bodyHeight =
      height -
      2 -
      above.length -
      (this.previewScroll + height - 2 < highlighted.length ? 1 : 0);
    const body = highlighted.slice(
      this.previewScroll,
      this.previewScroll + Math.max(1, bodyHeight),
    );
    const belowCount = Math.max(
      0,
      highlighted.length - this.previewScroll - body.length,
    );
    const below =
      belowCount > 0
        ? [this.theme.fg("dim", `↓ ${belowCount} more lines`)]
        : [];

    return this.padViewport([caption, "", ...above, ...body, ...below], height);
  }

  private renderPreviewCaption(preview: UndoPreviewResult): string {
    const fileLabel =
      this.previewMode === "file"
        ? this.theme.fg("accent", this.theme.bold("File"))
        : this.theme.fg("dim", "File");
    const diffLabel =
      this.previewMode === "diff"
        ? this.theme.fg("accent", this.theme.bold("Diff"))
        : this.theme.fg("dim", "Diff");
    const focus =
      this.focus === "preview"
        ? this.theme.fg("accent", "●")
        : this.theme.fg("dim", "○");
    const status = preview.reconstructed
      ? this.theme.fg("dim", preview.title)
      : this.theme.fg("warning", preview.title);
    return `${focus} ${fileLabel} ${this.theme.fg("dim", "·")} ${diffLabel}  ${status}`;
  }

  private highlightPreview(preview: UndoPreviewResult): string[] {
    if (!preview.reconstructed) return preview.lines;
    const language = preview.language ?? getLanguageFromPath(this.filePath);
    const highlighted = highlightCode(preview.lines.join("\n"), language);
    if (this.previewMode !== "file") return highlighted;

    return highlighted.map((line, index) => {
      const marker = preview.fileGutter?.[index] ?? "none";
      if (marker === "added") return `${this.theme.fg("success", "+")} ${line}`;
      if (marker === "removed") return `${this.theme.fg("error", "-")} ${line}`;
      return `  ${line}`;
    });
  }

  private getPreview(): UndoPreviewResult {
    if (
      this.cachedPreview?.seq === this.selectedSeq &&
      this.cachedPreview.mode === this.previewMode
    ) {
      return this.cachedPreview.result;
    }

    const result = buildUndoPreview({
      file: this.file,
      model: this.model,
      selectedSeq: this.selectedSeq,
      currentContent: this.currentContent,
      mode: this.previewMode,
    });
    this.cachedPreview = {
      seq: this.selectedSeq,
      mode: this.previewMode,
      result,
    };
    return result;
  }

  private moveSelection(delta: number): void {
    const index = this.selectedIndex();
    if (index < 0) return;

    const nextIndex = Math.max(
      0,
      Math.min(this.model.flat.length - 1, index + delta),
    );
    this.selectFlatNode(this.model.flat[nextIndex]);
  }

  private selectParent(): void {
    const parentSeq = this.model.parentBySeq.get(this.selectedSeq);
    if (!parentSeq) return;
    this.selectSeq(parentSeq);
  }

  private selectFirstChild(): void {
    const childSeq = this.model.childrenBySeq.get(this.selectedSeq)?.[0];
    if (!childSeq) return;
    this.selectSeq(childSeq);
  }

  private selectFlatNode(node: FlatUndoTreeNode | undefined): void {
    if (!node) return;
    this.selectSeq(node.seq);
  }

  private selectSeq(seq: number): void {
    if (!this.model.bySeq.has(seq)) return;
    this.selectedSeq = seq;
    this.previewScroll = 0;
    this.cachedPreview = null;
    this.ensureSelectedVisible();
    this.scrollPreviewToChange();
  }

  private togglePreviewMode(): void {
    this.previewMode = this.previewMode === "file" ? "diff" : "file";
    this.previewScroll = 0;
    this.cachedPreview = null;
    this.scrollPreviewToChange();
  }

  private selectedIndex(): number {
    return this.model.flat.findIndex((node) => node.seq === this.selectedSeq);
  }

  private ensureSelectedVisible(): void {
    const index = this.selectedIndex();
    if (index < 0) return;

    const offset = index + 2;
    if (offset < this.treeScroll) {
      this.treeScroll = offset;
    } else if (offset >= this.treeScroll + VIEWPORT_HEIGHT) {
      this.treeScroll = offset - VIEWPORT_HEIGHT + 1;
    }
  }

  private getTreeWidth(width: number): number {
    const maxDepth = this.model.flat.reduce(
      (max, node) => Math.max(max, node.depth),
      0,
    );
    const baseWidth = Math.min(34, Math.max(24, Math.floor(width * 0.3)));
    return Math.min(
      Math.floor(width * 0.45),
      Math.max(baseWidth, 24 + maxDepth * 2),
    );
  }

  private updateTreeHorizontalScroll(width: number): void {
    const selected = this.model.flat.find(
      (node) => node.seq === this.selectedSeq,
    );
    if (!selected) return;

    const selectedColumn = selected.depth * 2;
    const minimumVisibleLabel = 12;
    if (selectedColumn < width - minimumVisibleLabel) {
      this.treeHorizontalScroll = 0;
      return;
    }

    this.treeHorizontalScroll = Math.max(
      0,
      selectedColumn - Math.floor(width / 3),
    );
  }

  private scrollPreviewToChange(): void {
    const preview = this.getPreview();
    if (preview.changedLine === undefined) return;
    this.previewScroll = Math.max(0, preview.changedLine - 4);
  }

  private scrollPreview(delta: number): void {
    const preview = this.getPreview();
    const maxScroll = Math.max(0, preview.lines.length - VIEWPORT_HEIGHT + 3);
    this.previewScroll = Math.max(
      0,
      Math.min(maxScroll, this.previewScroll + delta),
    );
  }

  private padViewport(lines: string[], height: number): string[] {
    const result = [...lines];
    while (result.length < height) result.push("");
    return result;
  }
}
