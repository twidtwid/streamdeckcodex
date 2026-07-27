import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type ProfileDevice = {
  archiveName: string;
  columns: number;
  deviceType: number;
  model: string;
  name: string;
  rows: number;
  slug: string;
};

type ProfileKey = {
  actionId: string;
  name: string;
  settings: Record<string, unknown>;
  uuid: string;
};

type ProfilePage = {
  id: string;
  keys: ProfileKey[];
  name: string;
};

const configuration = JSON.parse(
  readFileSync(resolve("profile-src/keypad-profiles.json"), "utf8"),
) as { devices: ProfileDevice[] };
const contract = JSON.parse(
  readFileSync(resolve("profile-src/profile-contract.json"), "utf8"),
) as { pages: ProfilePage[] };
const pluginManifest = JSON.parse(
  readFileSync(
    resolve("com.todd.streamdeckcodex.sdPlugin/manifest.json"),
    "utf8",
  ),
) as { Profiles: Array<{ DeviceType: number; Name: string }> };
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) spawnSync("trash", [path]);
});

describe("bundled keypad profiles", () => {
  it("declares a model-specific profile for every keypad-only device", () => {
    for (const device of configuration.devices) {
      expect(pluginManifest.Profiles).toContainEqual({
        AutoInstall: true,
        DeviceType: device.deviceType,
        DontAutoSwitchWhenInstalled: true,
        Name: device.archiveName,
        Readonly: false,
      });
    }
  });

  it("keeps the live controls first, followed by sessions and workflows", () => {
    const expected = [
      ...contract.pages[1]!.keys,
      ...contract.pages[0]!.keys,
      ...contract.pages.slice(2).flatMap((page) => page.keys),
    ].map(actionIdentity);

    for (const device of configuration.devices) {
      const source = loadSource(device);
      const pages = source.manifest.Pages.Pages.map((id) =>
        loadPage(device, id),
      );
      const actual = pages.flatMap((page) =>
        orderedActions(page).map((action) => ({
          name: action.Name,
          settings: action.Settings,
          uuid: action.UUID,
        })),
      );
      expect(actual, device.name).toEqual(expected);
    }
  });

  it("uses only row-major keypad controllers and a hidden V3 default page", () => {
    for (const device of configuration.devices) {
      const capacity = device.columns * device.rows;
      const source = loadSource(device);
      const { Pages } = source.manifest;

      expect(source.manifest.Device.Model, device.name).toBe(device.model);
      expect(Pages.Current, device.name).toBe(Pages.Pages[0]);
      expect(Pages.Pages, device.name).not.toContain(Pages.Default);
      const defaultPage = loadPage(device, Pages.Default);
      expect(defaultPage.Controllers).toEqual([
        { Actions: null, Type: "Keypad" },
      ]);

      const actionIds = new Set<string>();
      for (const pageId of Pages.Pages) {
        const page = loadPage(device, pageId);
        expect(page.Controllers, `${device.name}: ${page.Name}`).toHaveLength(
          1,
        );
        expect(page.Controllers[0]!.Type).toBe("Keypad");
        const entries = orderedActionEntries(page);
        expect(entries.length).toBeLessThanOrEqual(capacity);
        expect(entries.map(([position]) => position)).toEqual(
          entries.map((_, index) => positionFor(index, device.columns)),
        );
        for (const [, action] of entries) {
          expect(action.ActionID).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          );
          expect(actionIds.has(action.ActionID), action.ActionID).toBe(false);
          actionIds.add(action.ActionID);
        }
      }
    }
  });

  it("builds reproducible, structurally valid archives for all supported devices", () => {
    const outputRoot = mkdtempSync(
      join(tmpdir(), "streamdeck-keypad-profiles-"),
    );
    temporaryRoots.push(outputRoot);
    const result = spawnSync(process.execPath, ["scripts/build-profile.mjs"], {
      encoding: "utf8",
      env: { ...process.env, STREAMDECK_PROFILE_OUTPUT_ROOT: outputRoot },
    });
    expect(result.status, result.stderr).toBe(0);

    for (const archiveName of [
      "streamdeckcodex-plus",
      ...configuration.devices.map((device) => device.archiveName),
    ]) {
      const archive = join(outputRoot, `${archiveName}.streamDeckProfile`);
      expect(existsSync(archive), archiveName).toBe(true);
      const verification = spawnSync("/usr/bin/unzip", ["-t", archive], {
        encoding: "utf8",
      });
      expect(verification.status, verification.stderr).toBe(0);
    }
  });
});

function actionIdentity(action: ProfileKey) {
  return {
    name: action.name,
    settings: action.settings,
    uuid: action.uuid,
  };
}

function loadSource(device: ProfileDevice) {
  return {
    manifest: JSON.parse(
      readFileSync(
        resolve("profile-src", device.archiveName, "manifest.json"),
        "utf8",
      ),
    ) as {
      Device: { Model: string };
      Pages: { Current: string; Default: string; Pages: string[] };
    },
  };
}

function loadPage(device: ProfileDevice, pageId: string) {
  return JSON.parse(
    readFileSync(
      resolve(
        "profile-src",
        device.archiveName,
        "Profiles",
        pageId,
        "manifest.json",
      ),
      "utf8",
    ),
  ) as {
    Controllers: Array<{
      Actions: null | Record<string, ProfileAction>;
      Type: string;
    }>;
    Name: string;
  };
}

type ProfileAction = {
  ActionID: string;
  Name: string;
  Settings: Record<string, unknown>;
  UUID: string;
};

function orderedActions(page: ReturnType<typeof loadPage>) {
  return orderedActionEntries(page).map(([, action]) => action);
}

function orderedActionEntries(page: ReturnType<typeof loadPage>) {
  return Object.entries(page.Controllers[0]!.Actions ?? {}).sort(
    ([left], [right]) => comparePositions(left, right),
  );
}

function comparePositions(left: string, right: string) {
  const [leftX = 0, leftY = 0] = left.split(",").map(Number);
  const [rightX = 0, rightY = 0] = right.split(",").map(Number);
  return leftY - rightY || leftX - rightX;
}

function positionFor(index: number, columns: number) {
  return `${index % columns},${Math.floor(index / columns)}`;
}
