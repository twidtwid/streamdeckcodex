import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};
const manifest = JSON.parse(
  readFileSync("com.todd.streamdeckcodex.sdPlugin/manifest.json", "utf8"),
) as { Version: string };
const temporaryRoots: string[] = [];

// Every generator that `generated:check` covers, enumerated directly so the
// test cannot silently skip one behind an `&&` inside an npm script string.
const GENERATORS = [
  "scripts/generate-lucide-paths.mjs",
  "scripts/generate-static-icons.mjs",
  "scripts/generate-wordmark-paths.mjs",
  "scripts/generate-bundled-licenses.mjs",
  "scripts/generate-profile.mjs",
  "scripts/generate-keypad-profiles.mjs",
];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    spawnSync("trash", [path]);
  }
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

describe("non-repeating check pipeline", () => {
  it("keeps the package and four-part Stream Deck versions aligned", () => {
    expect(manifest.Version).toBe(`${packageJson.version}.0`);
  });

  it("builds the native helper exactly once per check", () => {
    // `pretest` owns the native build, so `check` must reach it through
    // `npm test` and never call the build a second time itself.
    expect(packageJson.scripts.pretest).toBe("npm run native:build");
    expect(packageJson.scripts.check).toContain("npm test");
    expect(packageJson.scripts.check).not.toContain("native:build");
    expect(packageJson.scripts["test:unit"]).toBeUndefined();
  });

  it("accepts every generated artifact without rewriting it", () => {
    for (const script of GENERATORS) {
      const result = spawnSync(process.execPath, [resolve(script), "--check"], {
        encoding: "utf8",
      });
      expect(result.status, `${script}: ${result.stderr}`).toBe(0);
    }
  });

  it("embeds reproducible, privacy-safe build identity", () => {
    const outfile = join(temporaryRoot("streamdeck-bundle-"), "plugin.js");
    const result = spawnSync(process.execPath, ["scripts/build-bundle.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        STREAMDECK_BUILD_COMMIT: "fixture-commit",
        STREAMDECK_BUNDLE_OUTFILE: outfile,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const bundle = readFileSync(outfile, "utf8");
    expect(bundle).toContain("fixture-commit");
    expect(bundle).toContain('treeState: "dirty"');
    expect(bundle).not.toContain(process.env.HOME ?? "/Users/example");
    // The shipped bundle keeps the real commit.
    expect(
      readFileSync("com.todd.streamdeckcodex.sdPlugin/bin/plugin.js", "utf8"),
    ).not.toContain("fixture-commit");
  });

  it("rejects stale temporary outputs without writing them in check mode", () => {
    const temporary = temporaryRoot("streamdeck-generator-check-");

    const profileSource = join(temporary, "profile-source");
    cpSync(resolve("profile-src/streamdeckcodex-plus"), profileSource, {
      recursive: true,
    });
    const profileManifest = join(profileSource, "manifest.json");
    const staleProfile = JSON.parse(readFileSync(profileManifest, "utf8"));
    staleProfile.Name = "stale profile source";
    writeFileSync(
      profileManifest,
      `${JSON.stringify(staleProfile, null, 2)}\n`,
    );
    assertCheckDoesNotWrite({
      script: "scripts/generate-profile.mjs",
      destination: profileManifest,
      environment: { STREAMDECK_PROFILE_SOURCE_ROOT: profileSource },
    });

    const keypadRoot = join(temporary, "keypad-profiles");
    cpSync(
      resolve("profile-src/streamdeckcodex-mini"),
      join(keypadRoot, "streamdeckcodex-mini"),
      {
        recursive: true,
      },
    );
    for (const device of [
      "streamdeckcodex-stream-deck",
      "streamdeckcodex-xl",
      "streamdeckcodex-neo",
    ]) {
      cpSync(resolve("profile-src", device), join(keypadRoot, device), {
        recursive: true,
      });
    }
    const keypadManifest = join(
      keypadRoot,
      "streamdeckcodex-mini",
      "manifest.json",
    );
    const staleKeypad = JSON.parse(readFileSync(keypadManifest, "utf8"));
    staleKeypad.Name = "stale keypad source";
    writeFileSync(keypadManifest, `${JSON.stringify(staleKeypad, null, 2)}\n`);
    assertCheckDoesNotWrite({
      script: "scripts/generate-keypad-profiles.mjs",
      destination: keypadManifest,
      environment: { STREAMDECK_KEYPAD_PROFILE_ROOT: keypadRoot },
    });

    const lucideDestination = copyAndCorrupt(
      temporary,
      "lucide-paths.ts",
      "src/lib/lucide-paths.ts",
    );
    assertCheckDoesNotWrite({
      script: "scripts/generate-lucide-paths.mjs",
      destination: lucideDestination,
      environment: { STREAMDECK_LUCIDE_DESTINATION: lucideDestination },
    });

    const staticIconRoot = join(temporary, "static-icons");
    cpSync(resolve("com.todd.streamdeckcodex.sdPlugin/imgs"), staticIconRoot, {
      recursive: true,
    });
    const staleStaticIcon = join(staticIconRoot, "category.svg");
    writeFileSync(
      staleStaticIcon,
      `${readFileSync(staleStaticIcon, "utf8")}\n<!-- deliberately stale -->\n`,
    );
    assertCheckDoesNotWrite({
      script: "scripts/generate-static-icons.mjs",
      destination: staleStaticIcon,
      environment: { STREAMDECK_STATIC_ICON_ROOT: staticIconRoot },
    });

    const wordmarkDestination = copyAndCorrupt(
      temporary,
      "wordmark-paths.ts",
      "src/lib/wordmark-paths.ts",
    );
    assertCheckDoesNotWrite({
      script: "scripts/generate-wordmark-paths.mjs",
      destination: wordmarkDestination,
      environment: { STREAMDECK_WORDMARK_DESTINATION: wordmarkDestination },
    });
  });
});

function copyAndCorrupt(temporary: string, name: string, source: string) {
  const destination = join(temporary, name);
  const content = readFileSync(resolve(source), "utf8");
  writeFileSync(destination, `${content}\n// deliberately stale\n`);
  return destination;
}

function assertCheckDoesNotWrite({
  script,
  destination,
  environment,
}: {
  script: string;
  destination: string;
  environment: NodeJS.ProcessEnv;
}) {
  const before = readFileSync(destination);
  const beforeHash = createHash("sha256").update(before).digest("hex");
  const result = spawnSync(process.execPath, [resolve(script), "--check"], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  expect(result.status).not.toBe(0);
  const after = readFileSync(destination);
  expect(after).toEqual(before);
  expect(createHash("sha256").update(after).digest("hex")).toBe(beforeHash);
}
