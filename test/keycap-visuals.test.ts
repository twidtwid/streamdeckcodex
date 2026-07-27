import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";
import { LUCIDE_PATHS } from "../src/lib/lucide-paths.js";
import { keycapSvg } from "../src/lib/visuals.js";
import { WORKFLOWS } from "../src/lib/workflows.js";

const profileContract = JSON.parse(
  readFileSync(resolve("profile-src/profile-contract.json"), "utf8"),
) as { pages: Array<{ keys: Array<{ icon: string | null }> }> };

describe("Lucide keycap renderer", () => {
  it("keeps an ordinary glyph and its single caption in separate zones", () => {
    const svg = keycapSvg("Skills", "", "skills");
    expect(svg).toContain('transform="translate(36 15) scale(3)"');
    expect(svg).not.toContain('<rect x="8" y="8"');
    expect(svg).toContain('y="122"');
    expect(svg).toContain(">Skills</text>");
    expect(svg).not.toContain(">OPEN</text>");
  });

  it("clips oversized labels instead of allowing them to collide", () => {
    const svg = keycapSvg(
      "A deliberately oversized keycap label",
      "",
      "terminal",
    );
    expect(svg).toContain("A deliberat…");
    expect(svg).not.toContain("A DELIBERATEL…");
  });

  it("uses open-licensed vector wordmarks rather than copied or system-font labels", () => {
    const yolo = keycapSvg("YOLO", "Autonomous", "yolo");
    const yeet = keycapSvg("YEET", "Publish", "yeet");
    expect(yolo).not.toContain('<svg x="');
    expect(yeet).not.toContain('<svg x="');
    expect(yolo).toContain('transform="translate(18 ');
    expect(yeet).toContain('transform="translate(18 ');
    expect(yolo).not.toContain(">YOLO</text>");
    expect(yeet).not.toContain(">YEET</text>");
    expect(yolo).toContain(">Autonomous</text>");
    expect(yeet).toContain(">Publish</text>");
  });

  it("has a Lucide source for every functional and curated profile icon", () => {
    const curatedIcons = profileContract.pages
      .slice(2)
      .flatMap((page) =>
        page.keys
          .map((key) => key.icon)
          .filter((icon): icon is string => Boolean(icon)),
      );
    const iconNames = [
      ...COMMANDS.map((command) => command.icon),
      ...WORKFLOWS.map((workflow) => workflow.icon),
      ...curatedIcons,
      "command",
    ];
    expect(iconNames.filter((name) => !LUCIDE_PATHS[name])).toEqual([]);
  });
});
