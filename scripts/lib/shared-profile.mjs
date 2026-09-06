import { createHash } from "node:crypto";

/** Stable distinct IDs let shared and legacy profiles coexist on the same deck. */
export function sharedId(value) {
  const hex = createHash("sha256")
    .update(`streamdeck-shared-v1:${value}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`.toUpperCase();
}
export function sharedProfileName(name) {
  return name.replace(/^streamdeckcodex-/, "streamdeckai-");
}
export function sharedProfileDocument(value) {
  if (Array.isArray(value)) return value.map(sharedProfileDocument);
  if (value && typeof value === "object") {
    const result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sharedProfileDocument(item),
      ]),
    );
    if (
      typeof result.UUID === "string" &&
      result.UUID.startsWith("com.todd.streamdeckcodex.")
    ) {
      result.Settings = { ...(result.Settings ?? {}), provider: "auto" };
    }
    if (
      typeof result.Name === "string" &&
      result.Name.includes("Codex Companion")
    )
      result.Name = result.Name.replace("Codex Companion", "Codex + Claude");
    if (typeof result.PreconfiguredName === "string")
      result.PreconfiguredName = result.PreconfiguredName.replace(
        "Codex Companion",
        "Codex + Claude",
      );
    return result;
  }
  if (
    typeof value === "string" &&
    /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/i.test(value)
  )
    return sharedId(value);
  return value;
}
