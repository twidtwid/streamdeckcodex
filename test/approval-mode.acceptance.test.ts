import { describe, expect, it } from "vitest";
import { approvalKeySvg } from "../src/lib/visuals.js";

describe("approval-mode key", () => {
  it("renders every state with one Lucide glyph and a separate caption zone", () => {
    for (const mode of ["ask", "approve", "yolo", "custom"] as const) {
      const svg = approvalKeySvg(mode);
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).toContain(">Permissions</text>");
      const label =
        mode === "yolo" ? "YOLO" : `${mode[0]!.toUpperCase()}${mode.slice(1)}`;
      expect(svg).toContain(`>${label}</text>`);
      expect(svg).not.toContain("WORDMARK");
    }
  });

  it("renders unverified live state as UNKNOWN", () => {
    expect(approvalKeySvg("unknown")).toContain(">Unknown</text>");
    expect(approvalKeySvg("unknown")).toContain(">Permissions</text>");
  });
});
