import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const connectedQa = await import(
  new URL("../scripts/lib/connected-qa.mjs", import.meta.url).href
);
const {
  CONNECTED_RELEASE_STOP_BLOCKERS,
  loadCanonicalContract,
  requireFixture,
  validateReport,
} = connectedQa;
const { nativeHelperPath } = await import(
  new URL("../scripts/lib/native-helper-path.mjs", import.meta.url).href
);
const profileContract = JSON.parse(
  readFileSync(resolve("profile-src/profile-contract.json"), "utf8"),
) as { pages: Array<{ keys: unknown[] }> };
const profileKeyCount = profileContract.pages.reduce(
  (total, page) => total + page.keys.length,
  0,
);

describe("transactional connected QA contract", () => {
  it("uses the canonical key matrix", async () => {
    const contract = await loadCanonicalContract();
    expect(contract).toHaveLength(profileKeyCount);
    const locations = new Set(
      contract.map(
        (row: { page: number; position: string }) =>
          `${row.page}:${row.position}`,
      ),
    );
    expect(locations.size).toBe(profileKeyCount);
  });

  it("requires an explicit disposable fixture marker", async () => {
    await expect(requireFixture(process.cwd())).rejects.toThrow("Refusing");
  });

  it("uses the native helper output path produced by the build script", () => {
    expect(nativeHelperPath(resolve("."))).toBe(
      resolve("com.todd.streamdeckcodex.sdPlugin", "bin", "codex-ui-control"),
    );
  });

  it("rejects incomplete or unverified release evidence", () => {
    const errors = validateReport({
      keys: [
        { page: 1, position: "0,0", status: "PASS", controller: "Encoder" },
      ],
      cleanup: { equal: false },
    });
    expect(errors.join(" ")).toContain(`Expected ${profileKeyCount}`);
  });

  it("keeps every known connected-release gap as a hard STOP condition", () => {
    expect(CONNECTED_RELEASE_STOP_BLOCKERS).toEqual(
      expect.arrayContaining([
        expect.stringContaining("empty-composer"),
        expect.stringContaining("Workflow launch witnesses"),
        expect.stringContaining("New Chat"),
        expect.stringContaining("Send and Compact"),
        expect.stringContaining("New Project"),
        expect.stringContaining(`${profileKeyCount}-key Keypad`),
      ]),
    );
  });
});
