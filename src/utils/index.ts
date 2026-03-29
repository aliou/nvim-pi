export {
  clearNvimSocket,
  type NvimConnectionState,
  type ResolveSocketResult,
  resolveNvimSocket,
} from "./connection";

export {
  type CurrentFunctionResult,
  type DiagnosticItem,
  type DiagnosticsForFilesResult,
  type DiagnosticsResult,
  type FileDiagnostic,
  formatPath,
  isDiagnosticsForFilesResult,
  isSplitsResult,
  type NvimContext,
  type NvimContextAction,
  type NvimContextDetails,
  type NvimResult,
  type SplitInfo,
  type SplitsResult,
  severityColor,
} from "./types";
