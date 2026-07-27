import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse } from "acorn";
import { extractAll } from "@electron/asar";

const defaultAsar = "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const defaultOutput = resolve("extracted-app-icons");
const shapeTags = new Set([
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "g",
  "line",
  "mask",
  "path",
  "polygon",
  "polyline",
  "rect",
]);
const attributeNames = new Map([
  ["className", "class"],
  ["clipPath", "clip-path"],
  ["clipRule", "clip-rule"],
  ["fillRule", "fill-rule"],
  ["strokeLinecap", "stroke-linecap"],
  ["strokeLinejoin", "stroke-linejoin"],
  ["strokeMiterlimit", "stroke-miterlimit"],
  ["strokeWidth", "stroke-width"],
  ["tabIndex", "tabindex"],
]);

function argumentValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function literalValue(node, bindings = new Map()) {
  if (
    node?.type === "Literal" &&
    ["string", "number"].includes(typeof node.value)
  ) {
    return String(node.value);
  }
  if (
    node?.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  if (node?.type === "Literal" && typeof node.value === "boolean") {
    return String(node.value);
  }
  if (
    node?.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return `-${node.argument.value}`;
  }
  if (node?.type === "Identifier") {
    return bindings.get(node.name);
  }
  return undefined;
}

function propertyName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return undefined;
}

function objectProperties(node) {
  if (node?.type !== "ObjectExpression") return new Map();
  const properties = new Map();
  for (const property of node.properties) {
    if (property.type !== "Property" || property.kind !== "init") continue;
    const name = propertyName(property.key);
    if (name) properties.set(name, property.value);
  }
  return properties;
}

function callTag(node, bindings) {
  if (node?.type !== "CallExpression" || node.arguments.length < 2) {
    return undefined;
  }
  return literalValue(node.arguments[0], bindings);
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function renderChildren(node, bindings) {
  if (node?.type === "ArrayExpression") {
    return node.elements
      .map((child) => renderChildren(child, bindings))
      .filter(Boolean)
      .join("\n");
  }
  if (node?.type === "CallExpression") return renderElement(node, bindings);
  return "";
}

function renderElement(node, bindings) {
  const tag = callTag(node, bindings);
  if (!tag || !shapeTags.has(tag)) return "";
  const properties = objectProperties(node.arguments[1]);
  const attributes = [];
  for (const [name, valueNode] of properties) {
    if (name === "children" || name === "key") continue;
    const value = literalValue(valueNode, bindings);
    if (value === undefined) continue;
    attributes.push(
      `${attributeNames.get(name) ?? name}="${escapeAttribute(value)}"`,
    );
  }
  if (!hasRequiredGeometry(tag, attributes)) return "";
  const childrenNode = properties.get("children");
  const children = childrenNode ? renderChildren(childrenNode, bindings) : "";
  const opening = attributes.length
    ? `<${tag} ${attributes.join(" ")}>`
    : `<${tag}>`;
  return children
    ? `${opening}\n${children}\n</${tag}>`
    : `${opening.slice(0, -1)} />`;
}

function hasRequiredGeometry(tag, attributes) {
  const names = new Set(
    attributes.map((attribute) => attribute.slice(0, attribute.indexOf("="))),
  );
  if (tag === "path") return names.has("d");
  if (tag === "circle") return names.has("r");
  if (tag === "rect") return names.has("width") && names.has("height");
  if (tag === "line") {
    return ["x1", "x2", "y1", "y2"].every((name) => names.has(name));
  }
  if (tag === "polyline" || tag === "polygon") return names.has("points");
  if (tag === "ellipse") return names.has("rx") && names.has("ry");
  return true;
}

function rootCandidate(node, bindings) {
  if (callTag(node, bindings) !== "svg") return undefined;
  const properties = objectProperties(node.arguments[1]);
  const viewBox = literalValue(properties.get("viewBox"), bindings);
  if (!viewBox) return undefined;
  const viewBoxNumbers = viewBox.trim().split(/\s+/).map(Number);
  if (
    viewBoxNumbers.length !== 4 ||
    viewBoxNumbers.some((value) => !Number.isFinite(value)) ||
    viewBoxNumbers[2] <= 0 ||
    viewBoxNumbers[3] <= 0 ||
    viewBoxNumbers[2] > 64 ||
    viewBoxNumbers[3] > 64
  ) {
    return undefined;
  }
  const childrenNode = properties.get("children");
  const children = childrenNode ? renderChildren(childrenNode, bindings) : "";
  if (!children) return undefined;

  const width =
    literalValue(properties.get("width"), bindings) ??
    String(viewBoxNumbers[2]);
  const height =
    literalValue(properties.get("height"), bindings) ??
    String(viewBoxNumbers[3]);
  const rootAttributes = [];
  for (const name of [
    "fill",
    "stroke",
    "strokeWidth",
    "strokeLinecap",
    "strokeLinejoin",
  ]) {
    const valueNode = properties.get(name);
    const value = valueNode ? literalValue(valueNode, bindings) : undefined;
    if (value !== undefined) {
      rootAttributes.push(
        `${attributeNames.get(name) ?? name}="${escapeAttribute(value)}"`,
      );
    }
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeAttribute(width)}" height="${escapeAttribute(height)}" viewBox="${escapeAttribute(viewBox)}"${rootAttributes.length ? ` ${rootAttributes.join(" ")}` : ""}>`,
    children,
    "</svg>",
    "",
  ].join("\n");
  return {
    height,
    sourcePosition: node.loc?.start.line ?? 1,
    svg,
    viewBox,
    width,
  };
}

function staticBindings(sourceFile) {
  const bindings = new Map();
  const ambiguous = new Set();
  const setBinding = (name, node) => {
    if (!name || ambiguous.has(name)) return;
    const value = literalValue(node, bindings);
    if (value === undefined) return;
    const previous = bindings.get(name);
    if (previous !== undefined && previous !== value) {
      bindings.delete(name);
      ambiguous.add(name);
      return;
    }
    bindings.set(name, value);
  };
  walk(sourceFile, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      setBinding(node.id.name, node.init);
    } else if (
      node.type === "AssignmentExpression" &&
      node.operator === "=" &&
      node.left?.type === "Identifier"
    ) {
      setBinding(node.left.name, node.right);
    }
  });
  return bindings;
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value === "object" && "type" in value) {
      walk(value, visitor);
    }
  }
}

function sourceName(file) {
  let stem = basename(file, extname(file));
  for (let index = 0; index < 2; index += 1) {
    const withoutHash = stem.replace(
      /-(?:(?=[A-Za-z0-9_]{7,12}$)(?=[A-Za-z0-9_]*[A-Z0-9_])[A-Za-z0-9_]+|[A-Z]-[A-Za-z0-9_]{6,10})$/,
      "",
    );
    if (withoutHash === stem) break;
    stem = withoutHash;
  }
  if (
    !stem ||
    stem === "index" ||
    stem.startsWith("app-initial~") ||
    stem.startsWith("chunk-")
  ) {
    return "ui-icon";
  }
  return stem
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await javascriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function streamDeckSvg(svg) {
  return svg.replace(
    /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[^"]+" height="[^"]+"/,
    '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" color="#fff"',
  );
}

function contactSheet(entries) {
  const cards = entries
    .map(
      ({ file, name, sourceChunks, viewBox }) => `
        <article data-search="${escapeAttribute(`${name} ${sourceChunks.join(" ")}`.toLowerCase())}">
          <div class="icon"><img src="stream-deck/${file}" alt=""></div>
          <strong>${name}</strong>
          <small>${viewBox}</small>
        </article>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Extracted app UI icons</title>
    <style>
      :root { color-scheme: dark; font: 14px system-ui, sans-serif; background: #151515; color: #eee; }
      body { margin: 0; padding: 24px; }
      input { box-sizing: border-box; width: 100%; padding: 12px 14px; border: 1px solid #444; border-radius: 9px; background: #202020; color: inherit; }
      main { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 20px; }
      article { min-width: 0; padding: 12px; border: 1px solid #333; border-radius: 12px; background: #1d1d1d; }
      article[hidden] { display: none; }
      .icon { display: grid; place-items: center; aspect-ratio: 1; border-radius: 8px; background: #080808; color: white; }
      img { width: 72%; height: 72%; }
      strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      strong { margin-top: 10px; }
      small { margin-top: 3px; color: #999; }
    </style>
  </head>
  <body>
    <h1>Extracted app UI icons</h1>
    <p>${entries.length} unique static SVG glyphs. Local reference only.</p>
    <input id="search" type="search" placeholder="Filter icons" autofocus>
    <main>${cards}</main>
    <script>
      const search = document.querySelector("#search");
      const cards = [...document.querySelectorAll("article")];
      search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        for (const card of cards) card.hidden = !card.dataset.search.includes(query);
      });
    </script>
  </body>
</html>
`;
}

const asarPath = resolve(argumentValue("--asar", defaultAsar));
const outputRoot = resolve(argumentValue("--output", defaultOutput));
const forbiddenOutputs = new Set([
  resolve("/"),
  resolve(homedir()),
  resolve("."),
]);
if (forbiddenOutputs.has(outputRoot)) {
  throw new Error(`Refusing unsafe output directory: ${outputRoot}`);
}
const temporary = await mkdtemp(join(tmpdir(), "streamdeckcodex-app-icons-"));
const unpacked = join(temporary, "app");

try {
  extractAll(asarPath, unpacked);
  const assetsRoot = join(unpacked, "webview", "assets");
  const files = (await javascriptFiles(assetsRoot)).sort();
  const candidates = [];
  const parseFailures = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    let sourceFile;
    try {
      sourceFile = parse(source, {
        allowHashBang: true,
        ecmaVersion: "latest",
        locations: true,
        sourceType: "module",
      });
    } catch (error) {
      parseFailures.push({
        file: file.slice(unpacked.length + 1),
        message: error.message,
      });
      continue;
    }
    const relativeSource = file.slice(unpacked.length + 1);
    const bindings = staticBindings(sourceFile);
    walk(sourceFile, (node) => {
      if (node.type === "CallExpression") {
        const candidate = rootCandidate(node, bindings);
        if (candidate) {
          candidates.push({
            ...candidate,
            proposedName: sourceName(file),
            sourceChunk: relativeSource,
          });
        }
      }
    });
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const contentHash = sha256(candidate.svg);
    const existing = unique.get(contentHash);
    if (existing) {
      existing.sources.push({
        chunk: candidate.sourceChunk,
        line: candidate.sourcePosition,
      });
      continue;
    }
    unique.set(contentHash, {
      ...candidate,
      contentHash,
      sources: [
        {
          chunk: candidate.sourceChunk,
          line: candidate.sourcePosition,
        },
      ],
    });
  }

  const nameCounts = new Map();
  const entries = [...unique.values()]
    .sort((left, right) => {
      const nameOrder = left.proposedName.localeCompare(right.proposedName);
      return nameOrder || left.contentHash.localeCompare(right.contentHash);
    })
    .map((candidate) => {
      const count = (nameCounts.get(candidate.proposedName) ?? 0) + 1;
      nameCounts.set(candidate.proposedName, count);
      const name =
        candidate.proposedName === "ui-icon" || count > 1
          ? `${candidate.proposedName}-${candidate.contentHash.slice(0, 10)}`
          : candidate.proposedName;
      return {
        ...candidate,
        file: `${name}.svg`,
        name,
        sourceChunks: [...new Set(candidate.sources.map(({ chunk }) => chunk))],
      };
    });

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, "source"), { recursive: true });
  await mkdir(join(outputRoot, "stream-deck"), { recursive: true });
  for (const entry of entries) {
    await writeFile(join(outputRoot, "source", entry.file), entry.svg);
    await writeFile(
      join(outputRoot, "stream-deck", entry.file),
      streamDeckSvg(entry.svg),
    );
  }
  const manifest = {
    source: {
      appAsar: asarPath,
      sha256: sha256(await readFile(asarPath)),
    },
    extraction: {
      candidates: candidates.length,
      parseFailures,
      uniqueIcons: entries.length,
      rule: "Static JSX SVG roots with viewBox dimensions no larger than 64×64; Lucide createLucideIcon modules are not included.",
    },
    icons: entries.map(
      ({ contentHash, file, height, name, sources, viewBox, width }) => ({
        name,
        file,
        sha256: contentHash,
        width,
        height,
        viewBox,
        sources,
      }),
    ),
  };
  await writeFile(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(join(outputRoot, "index.html"), contactSheet(entries));
  await writeFile(
    join(outputRoot, "README.md"),
    `# Extracted ChatGPT/Codex UI glyphs

Generated locally from:

- \`${asarPath}\`
- SHA-256: \`${manifest.source.sha256}\`

The \`source/\` directory preserves each glyph's original viewBox and dimensions.
The \`stream-deck/\` directory sets the canvas to 144×144 while preserving the
same viewBox and vector paths. Open \`index.html\` to browse the catalog.

These files are extracted OpenAI application artwork for local reference. They
are intentionally Git-ignored and are not covered by this repository's MIT
license. Review OpenAI's terms before redistributing them.
`,
  );

  console.log(
    `Extracted ${entries.length} unique UI glyphs (${candidates.length} candidates) to ${outputRoot}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
