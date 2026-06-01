import type { UndoFile, UndoHeader } from "./types";

type MutableUndoEntry = {
  top: number;
  bot: number;
  lcount: number;
  lines: Buffer[];
};

type MutableUndoHeader = Omit<UndoHeader, "entries"> & {
  entries: MutableUndoEntry[];
};

export type UndoSnapshot = {
  seq: number;
  lines: Buffer[];
  changedLine?: number;
};

export type UndoReconstructionResult = {
  snapshots: Map<number, UndoSnapshot>;
  parentBySeq: Map<number, number>;
};

function splitContent(content: string): Buffer[] {
  if (content.length === 0) return [];
  return content
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => Buffer.from(line, "utf8"));
}

function cloneBufferLines(lines: Buffer[]): Buffer[] {
  return lines.map((line) => Buffer.from(line));
}

function cloneHeaders(file: UndoFile): Map<number, MutableUndoHeader> {
  return new Map(
    file.headers.map((header) => [
      header.seq,
      {
        ...header,
        entries: header.entries.map((entry) => ({
          top: entry.top,
          bot: entry.bot,
          lcount: entry.lcount,
          lines: cloneBufferLines(entry.lines),
        })),
      },
    ]),
  );
}

function applyUndoRedoSwap(
  lines: Buffer[],
  header: MutableUndoHeader,
): number | undefined {
  const nextEntries: MutableUndoEntry[] = [];
  let changedLine: number | undefined;

  for (const entry of header.entries) {
    const top = entry.top;
    const bot = entry.bot === 0 ? lines.length + 1 : entry.bot;

    if (top < 0 || top > lines.length || top >= bot || bot > lines.length + 1) {
      throw new Error(
        `Invalid undo entry for seq ${header.seq}: top=${entry.top} bot=${entry.bot} lineCount=${lines.length}`,
      );
    }

    const oldSize = bot - top - 1;
    const newSize = entry.lines.length;
    const removed = cloneBufferLines(lines.slice(top, top + oldSize));
    const inserted = cloneBufferLines(entry.lines);

    lines.splice(top, oldSize, ...inserted);

    entry.lines = removed;
    entry.bot = top + newSize + 1;
    nextEntries.unshift(entry);
    changedLine = changedLine === undefined ? top : Math.min(changedLine, top);
  }

  header.entries = nextEntries;
  return changedLine;
}

function buildGraph(headers: Map<number, MutableUndoHeader>): {
  adjacency: Map<number, { to: number; headerSeq: number }[]>;
  parentBySeq: Map<number, number>;
} {
  const adjacency = new Map<number, { to: number; headerSeq: number }[]>();
  const parentBySeq = new Map<number, number>();

  function addEdge(from: number, to: number, headerSeq: number): void {
    const edges = adjacency.get(from) ?? [];
    edges.push({ to, headerSeq });
    adjacency.set(from, edges);
  }

  for (const header of headers.values()) {
    const parent = header.nextSeq || 0;
    const child = header.seq;
    if (parent !== 0 && !headers.has(parent)) continue;

    parentBySeq.set(child, parent);
    addEdge(parent, child, child);
    addEdge(child, parent, child);
  }

  return { adjacency, parentBySeq };
}

export function reconstructUndoSnapshots(
  file: UndoFile,
  currentContent: string,
): UndoReconstructionResult {
  const headers = cloneHeaders(file);
  const { adjacency, parentBySeq } = buildGraph(headers);
  const startSeq = file.seqCur || 0;
  if (startSeq !== 0 && !headers.has(startSeq)) {
    throw new Error(
      `Current undo state ${startSeq} is not present in undofile`,
    );
  }

  const lines = splitContent(currentContent);
  const snapshots = new Map<number, UndoSnapshot>();
  const visited = new Set<number>();

  function dfs(seq: number, changedLine?: number): void {
    visited.add(seq);
    snapshots.set(seq, { seq, lines: cloneBufferLines(lines), changedLine });

    for (const edge of adjacency.get(seq) ?? []) {
      if (visited.has(edge.to)) continue;
      const header = headers.get(edge.headerSeq);
      if (!header) continue;

      const edgeChangedLine = applyUndoRedoSwap(lines, header);
      dfs(edge.to, edgeChangedLine);
      applyUndoRedoSwap(lines, header);
    }
  }

  dfs(startSeq);
  return { snapshots, parentBySeq };
}
