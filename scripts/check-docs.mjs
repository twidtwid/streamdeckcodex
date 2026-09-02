import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const documents = ["README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "QA.md"];
const failures = [];

for (const document of documents) {
  const path = resolve(root, document);
  const content = readFileSync(path, "utf8");
  for (const match of content.matchAll(/npm run ([a-z0-9:_-]+)/gi)) {
    const script = match[1];
    if (!packageJson.scripts?.[script]) {
      failures.push(`${document}: unknown package script ${script}`);
    }
  }
  for (const match of content.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (target && !existsSync(resolve(dirname(path), target))) {
      failures.push(`${document}: missing local link ${match[1]}`);
    }
  }
}

if (failures.length) {
  throw new Error(`Documentation check failed:\n${failures.join("\n")}`);
}
console.log(
  `Documentation commands and local links passed for ${documents.length} files.`,
);
