import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const sourceProfile = resolve("profile-src/streamdeckcodex-plus");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    spawnSync("trash", [path]);
  }
});

describe("six-page profile installer", () => {
  it("replaces every target page by index while retaining target page IDs", () => {
    const temporary = mkdtempSync(join(tmpdir(), "streamdeckcodex-install-"));
    temporaryRoots.push(temporary);
    const target = join(temporary, "fixture.sdProfile");
    cpSync(sourceProfile, target, { recursive: true });

    const targetRootPath = join(target, "manifest.json");
    const targetRoot = JSON.parse(readFileSync(targetRootPath, "utf8"));
    const originalIds = [...targetRoot.Pages.Pages];
    const replacementIds = originalIds.map((id: string, index: number) => {
      const replacement = `target-page-${index + 1}`;
      renameSync(
        join(target, "Profiles", id),
        join(target, "Profiles", replacement),
      );
      return replacement;
    });
    targetRoot.Pages.Pages = replacementIds;
    writeFileSync(targetRootPath, `${JSON.stringify(targetRoot, null, 2)}\n`);

    for (const directory of readdirSync(join(target, "Profiles"))) {
      if (!directory.startsWith("target-page-")) continue;
      const path = join(target, "Profiles", directory, "manifest.json");
      const page = JSON.parse(readFileSync(path, "utf8"));
      page.Name = "STALE";
      const keypad = page.Controllers.find(
        (controller: { Type: string }) => controller.Type === "Keypad",
      );
      keypad.Actions = {};
      writeFileSync(path, `${JSON.stringify(page, null, 2)}\n`);
    }

    const result = spawnSync(
      process.execPath,
      [resolve("scripts/install-keycap-pages.mjs"), target],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);

    const installedRoot = JSON.parse(readFileSync(targetRootPath, "utf8"));
    expect(installedRoot.Pages.Pages).toEqual(replacementIds);
    const sourceRoot = JSON.parse(
      readFileSync(join(sourceProfile, "manifest.json"), "utf8"),
    );
    for (let index = 0; index < 6; index += 1) {
      const expected = pageAt(sourceProfile, sourceRoot.Pages.Pages[index]);
      const observed = pageAt(target, replacementIds[index]!);
      expect(observed.Name).toBe(expected.Name);
      expect(
        observed.Controllers.find(
          (controller: { Type: string }) => controller.Type === "Keypad",
        ).Actions,
      ).toEqual(
        expected.Controllers.find(
          (controller: { Type: string }) => controller.Type === "Keypad",
        ).Actions,
      );
    }
  });
});

function pageAt(profile: string, id: string) {
  const directory = readdirSync(join(profile, "Profiles")).find(
    (candidate) => candidate.toUpperCase() === id.toUpperCase(),
  );
  if (!directory) throw new Error(`Missing page ${id}`);
  return JSON.parse(
    readFileSync(join(profile, "Profiles", directory, "manifest.json"), "utf8"),
  );
}
