import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

interface NvimConnectionDetails {
  status: "connected" | "disconnected" | "multiple" | "none";
  pid?: number;
  socket?: string;
  instanceCount?: number;
}

function extractContentText(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (item): item is { type: string; text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

export function registerNvimConnectionRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer("nvim-connection", (message, _options, theme) => {
    const details = message.details as NvimConnectionDetails | undefined;
    const box = new Box(1, 1, (s) => theme.bg("customMessageBg", s));
    const tag = theme.fg("customMessageLabel", theme.bold("[nvim]"));

    // Fallback when details is missing
    if (!details) {
      box.addChild(
        new Text(
          `${tag} ${theme.fg("dim", extractContentText(message.content))}`,
          0,
          0,
        ),
      );
      return box;
    }

    switch (details.status) {
      case "connected": {
        const pidInfo = details.pid
          ? theme.fg("dim", ` PID ${details.pid}`)
          : "";
        box.addChild(
          new Text(
            `${tag} ${theme.fg("success", "Connected")}${pidInfo}`,
            0,
            0,
          ),
        );
        return box;
      }

      case "disconnected": {
        box.addChild(
          new Text(`${tag} ${theme.fg("warning", "Disconnected")}`, 0, 0),
        );
        return box;
      }

      case "multiple": {
        const count = details.instanceCount ?? "multiple";
        box.addChild(
          new Text(
            `${tag} ${theme.fg("warning", `${count} instances found, none selected`)}`,
            0,
            0,
          ),
        );
        return box;
      }

      case "none": {
        box.addChild(
          new Text(`${tag} ${theme.fg("dim", "No instance found")}`, 0, 0),
        );
        return box;
      }

      default: {
        box.addChild(
          new Text(
            `${tag} ${theme.fg("dim", extractContentText(message.content))}`,
            0,
            0,
          ),
        );
        return box;
      }
    }
  });
}
