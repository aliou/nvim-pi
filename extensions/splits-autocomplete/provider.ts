import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { formatPath } from "../../src/format";
import { discoverNvim, queryNvim } from "../../src/nvim";
import { isSplitsResult, type SplitInfo } from "../../src/types";
import {
  createPrefixCompletionItem,
  extractPrefixCandidate,
  prependCompletionItem,
  replaceAutocompletePrefix,
} from "./completion";

const NVIM_SPLIT_PREFIX = "@vim:";
const NVIM_SPLIT_TOKEN_RE = /(?:^|\s)@vim:([^\s]*)$/;

function extractNvimSplitToken(textBeforeCursor: string): string | undefined {
  const match = textBeforeCursor.match(NVIM_SPLIT_TOKEN_RE);
  return match ? (match[1] ?? "") : undefined;
}

function getSplitValue(split: SplitInfo, cwd: string): string {
  return formatPath(split.file, cwd);
}

function getSplitDescription(split: SplitInfo, cwd: string): string {
  const details = [
    split.is_focused ? "focused" : undefined,
    split.filetype || undefined,
    `L${split.visible_range.first}-${split.visible_range.last}`,
    split.modified ? "modified" : undefined,
    path.isAbsolute(split.file) ? formatPath(split.file, cwd) : split.file,
  ].filter(Boolean);

  return details.join(" · ");
}

async function listOpenSplits(
  pi: ExtensionAPI,
  cwd: string,
  signal: AbortSignal,
): Promise<SplitInfo[]> {
  const instance = discoverNvim(cwd)[0];
  if (!instance) return [];

  const raw = await queryNvim(pi.exec, instance.lockfile.socket, "splits", {
    signal,
    timeout: 2000,
  });

  if (!isSplitsResult(raw)) return [];
  return raw.filter((split) => split.file.length > 0);
}

export function createNvimSplitsAutocompleteProvider(
  current: AutocompleteProvider,
  pi: ExtensionAPI,
  cwd: string,
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const token = extractNvimSplitToken(textBeforeCursor);

      if (token === undefined) {
        const currentSuggestions = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        );

        const prefixCandidate = extractPrefixCandidate(
          textBeforeCursor,
          NVIM_SPLIT_PREFIX,
        );
        if (prefixCandidate !== undefined) {
          const prefixItem = createPrefixCompletionItem({
            value: NVIM_SPLIT_PREFIX,
            description: "open Neovim splits",
          });

          return {
            items: prependCompletionItem(currentSuggestions?.items, prefixItem),
            prefix: prefixCandidate,
          };
        }

        return currentSuggestions;
      }

      try {
        const tokenLower = token.toLowerCase();
        const openSplits = await listOpenSplits(pi, cwd, options.signal);
        const splits = openSplits
          .filter((split) =>
            getSplitValue(split, cwd).toLowerCase().includes(tokenLower),
          )
          .sort((a, b) => {
            if (a.is_focused !== b.is_focused) {
              return a.is_focused ? -1 : 1;
            }
            return (b.last_accessed ?? 0) - (a.last_accessed ?? 0);
          });

        if (options.signal.aborted || splits.length === 0) {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }

        const items: AutocompleteItem[] = splits.map((split) => {
          const value = getSplitValue(split, cwd);
          return {
            value,
            label: value,
            description: getSplitDescription(split, cwd),
          };
        });

        return {
          items,
          prefix: `${NVIM_SPLIT_PREFIX}${token}`,
        };
      } catch {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
    },

    applyCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItem,
      prefix: string,
    ) {
      if (
        NVIM_SPLIT_PREFIX.startsWith(prefix) &&
        item.value === NVIM_SPLIT_PREFIX
      ) {
        return replaceAutocompletePrefix(
          lines,
          cursorLine,
          cursorCol,
          prefix,
          NVIM_SPLIT_PREFIX,
        );
      }

      return current.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    },

    shouldTriggerFileCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
    ) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (extractNvimSplitToken(textBeforeCursor) !== undefined) {
        return false;
      }

      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}
