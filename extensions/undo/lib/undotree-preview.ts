import { reconstructUndoSnapshots } from "../../../src/undo";
import type { UndoFile, UndoHeader } from "../../../src/undo/types";
import type { UndoTreeModel } from "./undotree-model";

export type PreviewMode = "file" | "diff";
export type FileGutterMarker = "added" | "removed" | "none";

export type UndoPreviewResult = {
  title: string;
  lines: string[];
  reconstructed: boolean;
  language?: string;
  changedLine?: number;
  fileGutter?: FileGutterMarker[];
};

function splitContent(content: string): string[] {
  return content.length === 0 ? [] : content.replace(/\n$/, "").split("\n");
}

function decodeLines(lines: Buffer[]): string[] {
  return lines.map((line) => line.toString("utf8"));
}

function decodeUndoLine(line: Buffer): string {
  return line.toString("utf8");
}

function metadataPreview(header: UndoHeader, error?: unknown): string[] {
  const lines = [
    "Preview unavailable for this state.",
    error instanceof Error ? error.message : "Could not replay undo records.",
    "",
    `change: ${header.seq}`,
    `entries: ${header.entries.length}`,
  ];

  for (const [index, entry] of header.entries.entries()) {
    lines.push("");
    lines.push(
      `entry ${index + 1}: top=${entry.top} bot=${entry.bot} saved=${entry.lines.length}`,
    );
    for (const savedLine of entry.lines.slice(0, 8)) {
      lines.push(`  ${decodeUndoLine(savedLine)}`);
    }
    if (entry.lines.length > 8) {
      lines.push(`  ... ${entry.lines.length - 8} more saved lines`);
    }
  }

  return lines;
}

function changedRange(
  before: string[],
  after: string[],
): { start: number; beforeEnd: number; afterEnd: number } | null {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start += 1;
  }

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    before[beforeEnd] === after[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  if (start > beforeEnd && start > afterEnd) return null;
  return { start, beforeEnd, afterEnd };
}

function simpleDiff(before: string[], after: string[]): string[] {
  const range = changedRange(before, after);
  if (!range) return ["No changes."];

  const { start, beforeEnd, afterEnd } = range;
  const lines = [`@@ change around line ${start + 1} @@`];
  for (let index = start; index <= beforeEnd; index += 1) {
    lines.push(`-${before[index] ?? ""}`);
  }
  for (let index = start; index <= afterEnd; index += 1) {
    lines.push(`+${after[index] ?? ""}`);
  }
  return lines;
}

function fileGutterMarkers(
  before: string[],
  after: string[],
): FileGutterMarker[] {
  const markers: FileGutterMarker[] = after.map(() => "none");
  const range = changedRange(before, after);
  if (!range) return markers;

  const { start, beforeEnd, afterEnd } = range;
  const addedCount = Math.max(0, afterEnd - start + 1);
  const removedCount = Math.max(0, beforeEnd - start + 1);

  if (addedCount > 0) {
    for (let index = start; index <= afterEnd; index += 1) {
      markers[index] = "added";
    }
  }

  if (removedCount > addedCount || addedCount === 0) {
    const markerIndex = Math.min(start, Math.max(0, markers.length - 1));
    if (markerIndex >= 0) markers[markerIndex] = "removed";
  }

  return markers;
}

export function buildUndoPreview(params: {
  file: UndoFile;
  model: UndoTreeModel;
  selectedSeq: number;
  currentContent: string;
  mode: PreviewMode;
}): UndoPreviewResult {
  const { file, model, selectedSeq, currentContent, mode } = params;
  const selected = model.bySeq.get(selectedSeq);
  if (!selected) {
    return {
      title: "No state selected",
      lines: ["No undo state selected."],
      reconstructed: false,
    };
  }

  let reconstruction: ReturnType<typeof reconstructUndoSnapshots>;
  try {
    reconstruction = reconstructUndoSnapshots(file, currentContent);
  } catch (error) {
    return {
      title: `change ${selectedSeq} · metadata`,
      lines: metadataPreview(selected, error),
      reconstructed: false,
    };
  }

  const snapshot = reconstruction.snapshots.get(selectedSeq);
  if (!snapshot) {
    return {
      title: `change ${selectedSeq} · metadata`,
      lines: metadataPreview(selected),
      reconstructed: false,
    };
  }

  const selectedLines = decodeLines(snapshot.lines);
  const parentSeq = reconstruction.parentBySeq.get(selectedSeq) ?? 0;
  const parentSnapshot = reconstruction.snapshots.get(parentSeq);
  const baseLines = parentSnapshot
    ? decodeLines(parentSnapshot.lines)
    : splitContent(currentContent);

  if (mode === "diff") {
    return {
      title: parentSnapshot ? "Diff vs parent" : "Diff vs current file",
      lines: simpleDiff(baseLines, selectedLines),
      reconstructed: true,
      language: "diff",
      changedLine: 0,
    };
  }

  return {
    title: `File at change ${selectedSeq}`,
    lines: selectedLines,
    reconstructed: true,
    changedLine: snapshot.changedLine,
    fileGutter: fileGutterMarkers(baseLines, selectedLines),
  };
}
