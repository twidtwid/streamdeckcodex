import { describe, expect, it } from "vitest";
import { commandKeySvg, keycapSvg } from "../src/lib/visuals.js";

describe("Codex Micro keycap renderer", () => {
  it("keeps the official-style glyph and both caption lines in separate zones", () => {
    const svg = keycapSvg("Codex", "OPEN SKILLS", "openai");
    expect(svg).toContain('transform="translate(18 4) scale(.75)"');
    expect(svg).not.toContain('d="M31 90h82"');
    expect(svg).toContain('y="108"');
    expect(svg).toContain('y="126"');
    expect(svg).toContain(">Codex</text>");
    expect(svg).toContain(">OPEN SKILLS</text>");
  });

  it("clips captions instead of allowing them to collide with the glyph", () => {
    const svg = keycapSvg(
      "A deliberately oversized keycap label",
      "A deliberately oversized caption",
      "terminal",
    );
    expect(svg).toContain("A delibera…");
    expect(svg).toContain("A deliberatel…");
  });

  it("uses the canonical Lucide navigation arrows for existing command keys", () => {
    const previous = commandKeySvg("Previous session", "#D9DEE8", "back");
    const next = commandKeySvg("Next session", "#D9DEE8", "forward");
    expect(previous).toContain('d="m12 19-7-7 7-7"');
    expect(next).toContain('d="m12 5 7 7-7 7"');
    expect(previous).not.toContain("M85 31L52 64l33 33");
  });
});
