import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    spawnSync("trash", [path]);
  }
});

describe("non-repeating check pipeline", () => {
  it("checks generated sources, builds native once, and uses a pretest-free unit stage", () => {
    const check = packageJson.scripts.check!;
    expect(check).toBe(
      "npm run public:check && npm run generated:check && npm run native:build && npm run format:check && npm run typecheck && npm run test:unit && npm run qa:design && npm run build:bundle && npm run validate",
    );
    expect(check.match(/native:build/g) ?? []).toHaveLength(1);
    expect(packageJson.scripts["test:unit"]!).toBe("vitest run");
    expect(packageJson.scripts.test).toBe("vitest run");
    expect(packageJson.scripts.pretest).toBe("npm run native:build");
  });

  it("accepts every generated artifact without rewriting it", () => {
    for (const script of [
      "icons:lucide",
      "icons:static",
      "icons:wordmarks",
      "licenses:bundle",
      "profile:check",
    ]) {
      const [command = "", ...args] = packageJson.scripts[script]!.split(" ");
      const result = spawnSync(command, [...args, "--check"], {
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    }
  });

  it("embeds reproducible, privacy-safe build identity", () => {
    const result = spawnSync(process.execPath, ["scripts/build-bundle.mjs"], {
      encoding: "utf8",
      env: { ...process.env, STREAMDECK_BUILD_COMMIT: "fixture-commit" },
    });
    expect(result.status, result.stderr).toBe(0);
    const bundle = readFileSync(
      "com.todd.streamdeckcodex.sdPlugin/bin/plugin.js",
      "utf8",
    );
    expect(bundle).toContain("fixture-commit");
    expect(bundle).toContain('treeState: "dirty"');
    expect(bundle).not.toContain(process.env.HOME ?? "/Users/example");
  });

  it("rejects stale temporary outputs without writing them in check mode", () => {
    const temporary = mkdtempSync(
      join(tmpdir(), "streamdeck-generator-check-"),
    );
    temporaryRoots.push(temporary);

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
