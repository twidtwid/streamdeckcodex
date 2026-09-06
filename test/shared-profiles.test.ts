import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const plugin = "com.todd.streamdeckcodex.sdPlugin";
const manifest = JSON.parse(readFileSync(`${plugin}/manifest.json`, "utf8"));
describe("opt-in shared profiles", () => {
  it("retains all legacy profiles and adds one opt-in shared profile per device", () => {
    const old = manifest.Profiles.filter((p: any) =>
      p.Name.startsWith("streamdeckcodex-"),
    );
    const shared = manifest.Profiles.filter((p: any) =>
      p.Name.startsWith("streamdeckai-"),
    );
    expect(old).toHaveLength(5);
    expect(shared).toHaveLength(5);
    expect(shared.map((p: any) => p.DeviceType).sort()).toEqual(
      old.map((p: any) => p.DeviceType).sort(),
    );
    for (const p of shared) {
      expect(p.AutoInstall).toBe(false);
    }
  });
  for (const device of ["plus", "mini", "neo", "xl", "stream-deck"]) {
    it(`gives ${device} distinct identities and auto settings on every plugin action`, () => {
      const archive = `${plugin}/streamdeckai-${device}.streamDeckProfile`;
      const entries = execFileSync("/usr/bin/unzip", ["-Z1", archive], {
        encoding: "utf8",
      })
        .trim()
        .split("\n");
      const rootName = entries.find((e) => e.endsWith(".sdProfile/"))!;
      const root = JSON.parse(
        execFileSync(
          "/usr/bin/unzip",
          ["-p", archive, `${rootName}manifest.json`],
          { encoding: "utf8" },
        ),
      );
      expect(root.Name).toContain("Codex + Claude");
      for (const page of [...root.Pages.Pages, root.Pages.Default])
        expect(entries).toContain(`${rootName}Profiles/${page}/manifest.json`);
      let count = 0;
      for (const path of entries.filter(
        (e) => e.endsWith("/manifest.json") && e.includes("/Profiles/"),
      )) {
        const page = JSON.parse(
          execFileSync("/usr/bin/unzip", ["-p", archive, path], {
            encoding: "utf8",
          }),
        );
        for (const c of page.Controllers ?? [])
          for (const a of Object.values(c.Actions ?? {}) as any[]) {
            if (a.UUID?.startsWith("com.todd.streamdeckcodex.")) {
              count++;
              expect(a.Settings.provider).toBe("auto");
            }
          }
      }
      expect(count).toBeGreaterThanOrEqual(50);
    });
  }
});
