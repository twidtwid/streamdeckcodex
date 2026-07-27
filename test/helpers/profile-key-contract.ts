import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import { COMMANDS } from "../../src/lib/commands.js";
import { KEYCAP_WORKFLOWS } from "../../src/lib/keycap-workflows.js";
import { LUCIDE_PATHS } from "../../src/lib/lucide-paths.js";

export type ProfileKeyContract = {
  page: number;
  position: `${number},${number}`;
  actionId: string;
  label: string;
  name: string;
  uuid: string;
  settings: Record<string, unknown>;
  behavior: "agent" | "command" | "approval" | "usage" | "context" | "keycap";
  target: "focused" | "global" | "display";
  icon: string | null;
};

type ProfileContract = {
  pages: Array<{
    id: string;
    keys: Array<Omit<ProfileKeyContract, "page">>;
  }>;
};

export const PROFILE_CONTRACT = JSON.parse(
  readFileSync(resolve("profile-src/profile-contract.json"), "utf8"),
) as ProfileContract;

export const PROFILE_KEY_CONTRACT: readonly ProfileKeyContract[] =
  PROFILE_CONTRACT.pages.flatMap((page, index) =>
    page.keys.map((key) => ({ ...key, page: index + 1 })),
  );

export function assertProfileContract(): void {
  const expectedKeyCount = PROFILE_CONTRACT.pages.reduce(
    (total, page) => total + page.keys.length,
    0,
  );
  expect(PROFILE_KEY_CONTRACT).toHaveLength(expectedKeyCount);
  expect(
    new Set(
      PROFILE_KEY_CONTRACT.map(({ page, position }) => `${page}:${position}`),
    ).size,
  ).toBe(expectedKeyCount);
  expect(
    new Set(PROFILE_KEY_CONTRACT.map(({ actionId }) => actionId)).size,
  ).toBe(expectedKeyCount);
  expect(PROFILE_CONTRACT.pages).toHaveLength(7);
  for (const [index, page] of PROFILE_CONTRACT.pages.entries()) {
    const rows = PROFILE_KEY_CONTRACT.filter((row) => row.page === index + 1);
    expect(rows).toHaveLength(index < 5 ? 8 : 5);
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          "profile-src/streamdeckcodex-plus/Profiles",
          page.id,
          "manifest.json",
        ),
        "utf8",
      ),
    );
    const keypad = manifest.Controllers.find(
      (entry: { Type: string }) => entry.Type === "Keypad",
    );
    for (const row of rows) {
      expect(
        keypad.Actions[row.position],
        `Page ${row.page} ${row.position}`,
      ).toMatchObject({
        ActionID: row.actionId,
        Name: row.name,
        UUID: row.uuid,
        Settings: row.settings,
      });
      const action = String(row.settings.action ?? "");
      if (action.startsWith("command:"))
        expect(COMMANDS.some(({ id }) => id === action.slice(8))).toBe(true);
      if (action.startsWith("workflow:"))
        expect(KEYCAP_WORKFLOWS.some(({ id }) => id === action.slice(9))).toBe(
          true,
        );
      if (row.icon && row.icon !== "yeet")
        expect(LUCIDE_PATHS[row.icon]).toBeTruthy();
    }
  }
}
