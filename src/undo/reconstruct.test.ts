import { describe, expect, it } from "vitest";
import { reconstructUndoSnapshots } from "./reconstruct";
import type { UndoFile, UndoHeader } from "./types";

const pos = { lnum: 1, col: 0, coladd: 0 };

function header(params: {
  seq: number;
  nextSeq: number;
  top: number;
  bot: number;
  lines: string[];
}): UndoHeader {
  return {
    seq: params.seq,
    nextSeq: params.nextSeq,
    prevSeq: 0,
    altNextSeq: 0,
    altPrevSeq: 0,
    cursor: pos,
    cursorVcol: 0,
    flags: 0,
    namedMarks: [],
    visual: { start: pos, end: pos, mode: 0, curswant: 0 },
    time: 0n,
    optionalFields: [],
    entries: [
      {
        top: params.top,
        bot: params.bot,
        lcount: 1,
        lines: params.lines.map((line) => Buffer.from(line)),
      },
    ],
    extmarks: [],
  };
}

function file(headers: UndoHeader[], seqCur: number): UndoFile {
  return {
    hash: Buffer.alloc(32),
    lineCount: 1,
    uLine: Buffer.alloc(0),
    uLineLnum: 0,
    uLineColnr: 0,
    oldHeadSeq: headers[0]?.seq ?? 0,
    newHeadSeq: headers.at(-1)?.seq ?? 0,
    curHeadSeq: seqCur,
    seqLast: headers.at(-1)?.seq ?? 0,
    seqCur,
    timeCur: 0n,
    optionalFields: [],
    headers,
  };
}

function lines(snapshot: Buffer[] | undefined): string[] | undefined {
  return snapshot?.map((line) => line.toString("utf8"));
}

describe("reconstructUndoSnapshots", () => {
  it("reconstructs linear history by swapping undo entries", () => {
    const undoFile = file(
      [
        header({ seq: 1, nextSeq: 0, top: 0, bot: 2, lines: ["a"] }),
        header({ seq: 2, nextSeq: 1, top: 0, bot: 2, lines: ["b"] }),
      ],
      2,
    );

    const result = reconstructUndoSnapshots(undoFile, "c\n");

    expect(lines(result.snapshots.get(0)?.lines)).toEqual(["a"]);
    expect(lines(result.snapshots.get(1)?.lines)).toEqual(["b"]);
    expect(lines(result.snapshots.get(2)?.lines)).toEqual(["c"]);
  });

  it("reconstructs sibling branches from current content", () => {
    const undoFile = file(
      [
        header({ seq: 1, nextSeq: 0, top: 0, bot: 2, lines: ["base"] }),
        header({ seq: 2, nextSeq: 1, top: 0, bot: 2, lines: ["left"] }),
        header({ seq: 3, nextSeq: 1, top: 0, bot: 2, lines: ["alt"] }),
      ],
      2,
    );

    const result = reconstructUndoSnapshots(undoFile, "right\n");

    expect(lines(result.snapshots.get(0)?.lines)).toEqual(["base"]);
    expect(lines(result.snapshots.get(1)?.lines)).toEqual(["left"]);
    expect(lines(result.snapshots.get(2)?.lines)).toEqual(["right"]);
    expect(lines(result.snapshots.get(3)?.lines)).toEqual(["alt"]);
  });
});
