import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";
import { LUCIDE_PATHS } from "../src/lib/lucide-paths.js";
import { keycapSvg } from "../src/lib/visuals.js";
import { WORKFLOWS } from "../src/lib/workflows.js";

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
    expect(yolo).toContain('viewBox="4.09 -73.8 184.93 77.6"');
    expect(yeet).toContain('viewBox="4.09 -73 184.23 76"');
    expect(yolo).not.toContain(">YOLO</text>");
    expect(yeet).not.toContain(">YEET</text>");
    expect(yolo).toContain(">AUTONOMOUS</text>");
    expect(yeet).toContain(">PUBLISH</text>");
  });

  it("has a Lucide source for every functional and curated profile icon", () => {
    const profileRoot = resolve(
      "profile-src",
      "streamdeckcodex-plus",
      "Profiles",
    );
    const curatedIcons = readdirSync(profileRoot)
      .filter((name) => name.startsWith("KEYCAPS-"))
      .flatMap((name) => {
        const manifest = JSON.parse(
          readFileSync(resolve(profileRoot, name, "manifest.json"), "utf8"),
        );
        const keypad = manifest.Controllers.find(
          (controller: { Type: string }) => controller.Type === "Keypad",
        );
        return Object.values(keypad.Actions).map(
          (entry) => (entry as { Settings: { icon: string } }).Settings.icon,
        );
      });
    const iconNames = [
      ...COMMANDS.map((command) => command.icon),
      ...WORKFLOWS.map((workflow) => workflow.icon),
      ...curatedIcons,
      "command",
    ];
    expect(iconNames.filter((name) => !LUCIDE_PATHS[name])).toEqual([]);
  });
});
