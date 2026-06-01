import type { UndoFile, UndoHeader } from "../../../src/undo/types";

export type UndoTreeNodeModel = {
  seq: number;
  header: UndoHeader;
  children: UndoTreeNodeModel[];
  parentSeq: number;
  depth: number;
};

export type FlatUndoTreeNode = {
  seq: number;
  header: UndoHeader;
  parentSeq: number;
  depth: number;
};

export type UndoTreeModel = {
  roots: UndoTreeNodeModel[];
  flat: FlatUndoTreeNode[];
  bySeq: Map<number, UndoHeader>;
  parentBySeq: Map<number, number>;
  childrenBySeq: Map<number, number[]>;
};

export function buildUndoTreeModel(file: UndoFile): UndoTreeModel {
  const bySeq = new Map<number, UndoHeader>();
  for (const header of file.headers) {
    bySeq.set(header.seq, header);
  }

  const childrenBySeq = new Map<number, number[]>();
  const parentBySeq = new Map<number, number>();

  for (const header of file.headers) {
    const parentSeq = header.nextSeq || 0;
    if (parentSeq !== 0 && !bySeq.has(parentSeq)) continue;

    parentBySeq.set(header.seq, parentSeq);
    const siblings = childrenBySeq.get(parentSeq) ?? [];
    siblings.push(header.seq);
    childrenBySeq.set(parentSeq, siblings);
  }

  for (const children of childrenBySeq.values()) {
    children.sort((a, b) => a - b);
  }

  const flat: FlatUndoTreeNode[] = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();

  function build(seq: number, depth: number): UndoTreeNodeModel | null {
    const header = bySeq.get(seq);
    if (!header || visiting.has(seq) || visited.has(seq)) return null;

    visiting.add(seq);
    visited.add(seq);

    const parentSeq = parentBySeq.get(seq) ?? 0;
    flat.push({ seq, header, parentSeq, depth });

    const children = (childrenBySeq.get(seq) ?? [])
      .map((childSeq) => build(childSeq, depth + 1))
      .filter((node): node is UndoTreeNodeModel => node !== null);

    visiting.delete(seq);
    return { seq, header, children, parentSeq, depth };
  }

  const roots = (childrenBySeq.get(0) ?? [])
    .map((seq) => build(seq, 0))
    .filter((node): node is UndoTreeNodeModel => node !== null);

  for (const seq of [...bySeq.keys()].sort((a, b) => a - b)) {
    if (visited.has(seq)) continue;
    const node = build(seq, 0);
    if (node) roots.push(node);
  }

  return { roots, flat, bySeq, parentBySeq, childrenBySeq };
}

export function pickInitialUndoSeq(
  file: UndoFile,
  model: UndoTreeModel,
): number {
  const candidates = [
    file.seqCur,
    file.newHeadSeq,
    file.seqLast,
    file.curHeadSeq,
  ];
  for (const seq of candidates) {
    if (seq !== 0 && model.bySeq.has(seq)) return seq;
  }

  return model.flat[0]?.seq ?? 0;
}

export function summarizeUndoDelta(header: UndoHeader): string {
  let removed = 0;
  let added = 0;

  for (const entry of header.entries) {
    removed += Math.max(0, entry.bot - entry.top - 1);
    added += entry.lines.length;
  }

  if (removed === 0 && added === 0) return "±0";
  return `+${added} −${removed}`;
}

export function formatRelativeUndoTime(seconds: bigint): string {
  if (seconds <= 0n) return "unknown";

  const date = new Date(Number(seconds) * 1000);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "unknown";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSeconds < 30) return "now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatUndoTime(seconds: bigint): string {
  if (seconds <= 0n) return "unknown";

  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return "unknown";

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
