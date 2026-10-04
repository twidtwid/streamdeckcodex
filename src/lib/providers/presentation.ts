import type { ProviderId } from "./types.js";
const badges = new Map<string, ProviderId | "auto">();
export function setProviderBadge(
  id: string,
  provider?: ProviderId | "auto",
): void {
  if (provider) badges.set(id, provider);
  else badges.delete(id);
}
export function badgeFor(id?: string): string | undefined {
  const provider = id ? badges.get(id) : undefined;
  return provider === "claude"
    ? "CLAUDE"
    : provider === "codex"
      ? "CODEX"
      : provider === "auto"
        ? "AUTO"
        : undefined;
}
export function badgeImage(image: string, label?: string): string {
  if (!label || !image.startsWith("data:image/svg+xml;base64,")) return image;
  const svg = Buffer.from(image.split(",")[1]!, "base64").toString("utf8");
  const badge = `<rect x="37" y="1" width="70" height="12" rx="3" fill="#090B0F"/><text x="72" y="10" text-anchor="middle" fill="${label === "CLAUDE" ? "#E7A589" : "#9CD5FE"}" font-family="system-ui,sans-serif" font-size="10" font-weight="800">${label}</text>`;
  return (
    "data:image/svg+xml;base64," +
    Buffer.from(svg.replace("</svg>", badge + "</svg>")).toString("base64")
  );
}
export function badgeFeedback(feedback: unknown, label?: string): unknown {
  if (!label || !feedback || typeof feedback !== "object") return feedback;
  const value = feedback as Record<string, unknown>;
  return { ...value, title: `${label} · ${value.title ?? ""}` };
}
