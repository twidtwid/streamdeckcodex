import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const bundledVisuals = resolve(
  tmpdir(),
  `streamdeckcodex-visuals-${randomUUID()}.mjs`,
);
await build({
  stdin: {
    contents:
      'export { agentKeySvg, STATUS_COLOR } from "./src/lib/visuals.ts";',
    resolveDir: process.cwd(),
    sourcefile: "status-visuals-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile: bundledVisuals,
});
const { agentKeySvg, STATUS_COLOR } = await import(
  pathToFileURL(bundledVisuals).href
);

const outputDirectory = resolve(
  process.argv[2] ?? "/tmp/streamdeckcodex-session-status-fixtures",
);

await mkdir(outputDirectory, { recursive: true });

const base = {
  rolloutPath: "/tmp/status-fixture.jsonl",
  cwd: "/tmp/streamdeckcodex",
  title: "Status fixture",
  preview: "Status fixture",
  recencyAtMs: 1,
  displayTitle: "Status fixture",
  detail: "Fixture",
  lastEventAt: 1,
  sessionLabel: "Status",
  sessionIndex: 0,
};

for (const status of Object.keys(STATUS_COLOR)) {
  for (const isActive of [false, true]) {
    const suffix = isActive ? "active" : "inactive";
    const svg = agentKeySvg(
      {
        ...base,
        id: `${status}-${suffix}`,
        status,
        isActive,
      },
      0,
    );
    await writeFile(
      resolve(outputDirectory, `${status}-${suffix}.svg`),
      svg,
      "utf8",
    );
  }
}

process.stdout.write(`${outputDirectory}\n`);
