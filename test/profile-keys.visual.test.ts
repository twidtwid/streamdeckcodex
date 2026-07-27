import { describe, expect, it } from "vitest";
import {
  PROFILE_KEY_CONTRACT,
  type ProfileKeyContract,
} from "./helpers/profile-key-contract.js";
import { COMMANDS } from "../src/lib/commands.js";
import {
  agentKeySvg,
  approvalKeySvg,
  commandKeySvg,
  contextKeySvg,
  keycapSvg,
  usageKeySvg,
} from "../src/lib/visuals.js";

function visualFor(row: ProfileKeyContract): string {
  switch (row.behavior) {
    case "agent":
      return agentKeySvg(undefined, Number(row.settings.slot) - 1);
    case "approval":
      return approvalKeySvg("yolo");
    case "command": {
      const command = COMMANDS.find(({ id }) => id === row.settings.commandId)!;
      return commandKeySvg(command.label, command.accent, command.icon);
    }
    case "context":
      return contextKeySvg(undefined, "remaining");
    case "keycap":
      return keycapSvg(
        row.label,
        String(row.settings.description ?? ""),
        String(row.settings.icon),
      );
    case "usage":
      return usageKeySvg(undefined, "weekly");
  }
}

describe("50-key visual contract", () => {
  it.each(PROFILE_KEY_CONTRACT)(
    "renders $label without clipping syntax or an inset card",
    (row) => {
      const svg = visualFor(row);
      expect(svg).toContain('width="144" height="144"');
      expect(svg).not.toContain("…");
      expect(svg).not.toContain('x="8" y="8"');
    },
  );

  it("keeps Permissions identity below its dynamic main value", () => {
    expect(approvalKeySvg("ask")).toContain(">Ask<");
    expect(approvalKeySvg("ask")).toContain(">Permissions<");
  });
});
