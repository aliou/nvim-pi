export { computeUndoHash, contentToUndoLines, undoLineCount } from "./hash";
export { parseUndofile } from "./parse";
export { DEFAULT_UNDODIR, getUndoFilePath, normalizeUndodir } from "./path";
export { reconstructUndoSnapshots, type UndoSnapshot } from "./reconstruct";
export { serializeUndofile } from "./serialize";
export type { UpdateUndofileResult } from "./types";
export {
  appendUndoEntryToUndofile,
  updateUndofileForExternalWrite,
} from "./update";
