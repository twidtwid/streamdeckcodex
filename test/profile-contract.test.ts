import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertProfileContract } from "./helpers/profile-key-contract.js";

const contractPath = resolve("profile-src/profile-contract.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as unknown;
const behaviors = new Set([
  "agent",
  "command",
  "approval",
  "usage",
  "context",
  "keycap",
]);
const targets = new Set(["focused", "global", "display"]);

type ContractKey = {
  position: string;
  actionId: string;
  label: string;
  name: string;
  uuid: string;
  settings: Record<string, unknown>;
  behavior: string;
  target: string;
  icon: string | null;
};
type ContractPage = {
  id: string;
  name: string;
  slug: string;
  dimensions: { columns: number; rows: number; emptyPositions: string[] };
  visual: {
    liveOcrAnchors: string[];
    requiredLiveAnchors: number;
    requiresLivePercent: boolean;
  };
  keys: ContractKey[];
};
type ProfileContract = {
  profile: { name: string; preconfiguredName: string };
  pages: ContractPage[];
};

function parseContract(value: unknown): ProfileContract {
  if (!value || typeof value !== "object")
    throw new Error("Contract is not an object.");
  const parsed = value as Partial<ProfileContract>;
  if (!parsed.profile || !Array.isArray(parsed.pages))
    throw new Error("Contract is missing profile/pages.");
  for (const page of parsed.pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.keys))
      throw new Error("Contract page is invalid.");
    if (!page.dimensions || !page.visual)
      throw new Error("Contract page metadata is missing.");
    for (const key of page.keys) {
      if (!key || typeof key !== "object" || !key.settings)
        throw new Error("Contract key is invalid.");
    }
  }
  return parsed as ProfileContract;
}

describe("neutral 50-key profile contract", () => {
  it("is complete, unique, and registry-backed", () => {
    const profile = parseContract(contract);
    expect(profile.pages).toHaveLength(7);
    expect(profile.pages.map((page) => page.keys.length)).toEqual([
      8, 8, 8, 8, 8, 5, 5,
    ]);
    const keys = profile.pages.flatMap((page, index) =>
      page.keys.map((key) => ({ ...key, page: index + 1 })),
    );
    expect(keys).toHaveLength(50);
    expect(new Set(profile.pages.map((page) => page.id)).size).toBe(7);
    expect(new Set(keys.map((key) => `${key.page}:${key.position}`)).size).toBe(
      50,
    );
    expect(new Set(keys.map((key) => key.actionId)).size).toBe(50);
    for (const page of profile.pages) {
      expect(page.dimensions.columns).toBe(4);
      expect(page.dimensions.rows).toBe(2);
      expect(new Set(page.dimensions.emptyPositions).size).toBe(
        page.dimensions.emptyPositions.length,
      );
      expect(page.keys.length + page.dimensions.emptyPositions.length).toBe(8);
      expect(page.visual.liveOcrAnchors.length).toBeGreaterThanOrEqual(
        page.visual.requiredLiveAnchors,
      );
    }
    for (const key of keys) {
      expect(behaviors.has(key.behavior)).toBe(true);
      expect(targets.has(key.target)).toBe(true);
      expect(key.name).toBe(
        key.settings.description
          ? `${key.label} — ${key.settings.description}`
          : key.label,
      );
    }
  });

  it("matches the generated Stream Deck + pages and the action registries", () => {
    // The shared helper owns the contract-to-profile and registry mapping so
    // no other test re-walks the seven pages.
    assertProfileContract();
  });
});
