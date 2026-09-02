import type {
  AgentSnapshot,
  AgentStatus,
  ContextSnapshot,
  SessionSnapshot,
  UsageSnapshot,
} from "../types.js";
import type { AvailabilityReason } from "./availability.js";
import { compactContext, type ContextView } from "./context.js";
import type { CodexApprovalMode } from "./codex-ui-control.js";
import { LUCIDE_PATHS } from "./lucide-paths.js";
import { WORDMARK_PATHS } from "./wordmark-paths.js";

export const STATUS_COLOR: Record<AgentStatus, string> = {
  off: "#000000",
  idle: "#FFFFFF",
  unread: "#9BF396",
  thinking: "#9CD5FE",
  running: "#9CD5FE",
  "needs-input": "#FFD0B8",
  error: "#FF7373",
};

const NEEDS_INPUT_OUTLINE = "#9A5B45";
const NEEDS_INPUT_TEXT = "#E7A589";
const PRIMARY_LABEL_SIZE = 16;
const WRAPPED_LABEL_SIZE = 15;
const SECONDARY_LABEL_SIZE = 10;

export const STATUS_LABEL: Record<AgentStatus, string> = {
  off: "Empty slot",
  idle: "Idle",
  unread: "Unread",
  thinking: "Thinking",
  running: "Running",
  "needs-input": "Needs input",
  error: "Error",
};

const STATUS_ICON: Record<AgentStatus, string> = {
  off: "status-off",
  idle: "status-idle",
  unread: "status-unread",
  thinking: "status-thinking",
  running: "status-running",
  "needs-input": "status-needs-input",
  error: "status-error",
};

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character]!,
  );
}

function titleLines(title: string): [string, string] {
  const words = title.replace(/\s+/g, " ").trim().split(" ");
  let first = "";
  let second = "";
  let fillingSecond = false;
  for (const word of words) {
    if (!fillingSecond) {
      const candidate = `${first} ${word}`.trim();
      if (candidate.length <= 12) {
        first = candidate;
        continue;
      }
      fillingSecond = true;
    }
    const candidate = `${second} ${word}`.trim();
    if (candidate.length > 12) break;
    second = candidate;
  }
  return [first || "Codex", second];
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function agentKeySvg(
  snapshot?: AgentSnapshot | SessionSnapshot,
  slot = 0,
): string {
  const status = snapshot?.status ?? "off";
  const color = STATUS_COLOR[status];
  const label = snapshot
    ? "sessionLabel" in snapshot
      ? snapshot.sessionLabel
      : snapshot.displayTitle
    : "New chat";
  const isActive =
    snapshot && "isActive" in snapshot ? snapshot.isActive : false;
  const pulse = status === "thinking" || status === "running";
  const accent = isActive
    ? "#FFFFFF"
    : status === "off"
      ? "#30363D"
      : status === "needs-input"
        ? NEEDS_INPUT_OUTLINE
        : color;
  const glyphColor = status === "off" ? "#626C7A" : color;
  const statusText =
    status === "off"
      ? "#6C7480"
      : status === "needs-input"
        ? NEEDS_INPUT_TEXT
        : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <rect x="18" y="14" width="108" height="3" rx="1.5" fill="${accent}"${pulse ? ' opacity=".9"' : ""}/>
    ${isActive ? '<text x="18" y="31" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="800" letter-spacing=".6">NOW</text>' : ""}
    ${commandIcon(STATUS_ICON[status], glyphColor, 30, 2.7)}
    <text x="72" y="114" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="18" font-weight="800">${escapeXml(label)}</text>
    <text x="72" y="130" text-anchor="middle" fill="${statusText}" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="750" letter-spacing=".35">${escapeXml(STATUS_LABEL[status].toUpperCase())}</text>
    ${isActive ? "" : `<text x="126" y="31" text-anchor="end" fill="#7E8795" font-family="monospace" font-size="12">${slot + 1}</text>`}
  </svg>`;
}

function commandIcon(
  icon: string,
  accent: string,
  top = 16,
  scale = 3,
): string {
  const lucide = LUCIDE_PATHS[icon] ?? LUCIDE_PATHS.command;
  if (!lucide) throw new Error(`Missing Lucide icon mapping: ${icon}`);
  const normalizedScale = Number(scale.toFixed(2));
  const normalizedTop = Number(top.toFixed(2));
  const left = Number(((144 - 24 * normalizedScale) / 2).toFixed(2));
  return `<g transform="translate(${left} ${normalizedTop}) scale(${normalizedScale})" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${lucide}</g>`;
}

const KEYCAP_ACCENT: Record<string, string> = {
  accept: "#7EE787",
  apps: "#C8A4FF",
  audit: "#FFD166",
  "brain-medium": "#C8A4FF",
  "brain-outline": "#C8A4FF",
  "branch-add": "#79C0FF",
  "branch-back": "#79C0FF",
  branch: "#79C0FF",
  bolt: "#FFD166",
  cloud: "#9CD5FE",
  "cloud-upload": "#9CD5FE",
  commit: "#79C0FF",
  confetti: "#7EE787",
  debug: "#FFD166",
  deploy: "#9CD5FE",
  dictate: "#C8A4FF",
  diff: "#79C0FF",
  document: "#D9DEE8",
  download: "#D9DEE8",
  edit: "#79C0FF",
  enter: "#7EE787",
  explain: "#C8A4FF",
  fix: "#FF7B72",
  folder: "#9CD5FE",
  "folder-plus": "#9CD5FE",
  goal: "#FFD166",
  "new-chat": "#79C0FF",
  merge: "#79C0FF",
  optimize: "#7EE787",
  play: "#7EE787",
  push: "#79C0FF",
  refactor: "#79C0FF",
  reject: "#FF7B72",
  release: "#7EE787",
  search: "#D9DEE8",
  send: "#7EE787",
  settings: "#D9DEE8",
  sidebar: "#D9DEE8",
  skills: "#C8A4FF",
  terminal: "#D9DEE8",
  tests: "#FFD166",
  trash: "#FF7B72",
  undo: "#79C0FF",
  sessions: "#C8A4FF",
  summarize: "#D9DEE8",
  yeet: "#9CD5FE",
  yolo: "#FFD166",
};

const DETAILED_KEYCAP_ICONS = new Set([
  "brain-medium",
  "brain-outline",
  "confetti",
  "debug",
  "refactor",
  "settings",
]);

function wordmarkGraphic(icon: "yeet" | "yolo", accent: string): string {
  const wordmark = WORDMARK_PATHS[icon];
  const scale = Math.min(108 / wordmark.width, 58 / wordmark.height);
  const renderedWidth = wordmark.width * scale;
  const renderedHeight = wordmark.height * scale;
  const left = Number(((144 - renderedWidth) / 2).toFixed(2));
  const top = Number((18 + (58 - renderedHeight) / 2).toFixed(2));
  const normalizedScale = Number(scale.toFixed(4));
  return `<g>
    <path d="${wordmark.d}" fill="#05070A" opacity=".75" transform="translate(${left + 2.2} ${top + 3.2}) scale(${normalizedScale})"/>
    <path d="${wordmark.d}" fill="#F7F9FC" transform="translate(${left} ${top}) scale(${normalizedScale})"/>
    <rect x="28" y="82" width="88" height="4" rx="2" fill="${accent}"/>
    <rect x="28" y="82" width="24" height="4" rx="2" fill="#FFFFFF"/>
  </g>`;
}

export function commandKeySvg(
  label: string,
  accent = "#2F81F7",
  icon = "command",
  modeState?: "ACTIVE" | "OFF",
): string {
  const [first, second] = titleLines(label);
  const stateMarkup = modeState
    ? `<rect x="41" y="14" width="62" height="20" rx="10" fill="${modeState === "ACTIVE" ? "#35C759" : "#6C7480"}"/>
       <text x="72" y="28" text-anchor="middle" fill="#0B0D10" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="800">${modeState}</text>`
    : "";
  const glyph =
    icon === "compact"
      ? `<circle cx="72" cy="56" r="34" fill="${accent}"/>
         ${commandIcon(icon, "#090B0F", 26, 2.55)}`
      : commandIcon(icon, accent, modeState ? 39 : 18, modeState ? 2.55 : 3.15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    ${stateMarkup}
    ${glyph}
    <text x="72" y="${second ? 116 : 122}" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${second ? WRAPPED_LABEL_SIZE : PRIMARY_LABEL_SIZE}" font-weight="750">${escapeXml(first)}</text>
    ${second ? `<text x="72" y="133" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${WRAPPED_LABEL_SIZE}" font-weight="750">${escapeXml(second)}</text>` : ""}
  </svg>`;
}

export type ApprovalDisplayMode = CodexApprovalMode | AvailabilityReason;

const APPROVAL_VISUALS: Record<
  ApprovalDisplayMode,
  { accent: string; label: string }
> = {
  ask: { accent: "#79C0FF", label: "Ask" },
  approve: { accent: "#7EE787", label: "Approve" },
  yolo: { accent: "#FFD166", label: "YOLO" },
  custom: { accent: "#C8A4FF", label: "Custom" },
  "no-focus": { accent: "#6C7480", label: "No Chat" },
  "codex-background": { accent: "#6C7480", label: "Background" },
  accessibility: { accent: "#FF7373", label: "Access" },
  stale: { accent: "#6C7480", label: "Stale" },
  "unsupported-schema": { accent: "#FF7373", label: "Unsupported" },
  timeout: { accent: "#FF7373", label: "Timeout" },
  "target-mismatch": { accent: "#FF7373", label: "Wrong Chat" },
  busy: { accent: "#FFD166", label: "Busy" },
  "not-exposed": { accent: "#6C7480", label: "No Data" },
};

export function approvalKeySvg(mode: ApprovalDisplayMode): string {
  const visual = APPROVAL_VISUALS[mode];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <rect x="18" y="14" width="108" height="3" rx="1.5" fill="${visual.accent}"/>
    ${commandIcon("yolo", visual.accent, 22, 2.75)}
    <text x="72" y="111" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${PRIMARY_LABEL_SIZE}" font-weight="800">${visual.label}</text>
    <text x="72" y="128" text-anchor="middle" fill="#8D97A5" font-family="-apple-system,system-ui,sans-serif" font-size="${SECONDARY_LABEL_SIZE}" font-weight="700">Permissions</text>
  </svg>`;
}

/**
 * Dedicated Codex Micro reference-key renderer.  Command buttons can trade
 * space between an icon and a label; the keycap pages cannot.  This reserves
 * a hard icon zone (y=20..82) and a hard two-line caption zone (y=102..126),
 * which keeps every one of the 32 caps legible at 72px hardware resolution.
 */
export function keycapSvg(
  label: string,
  description: string,
  icon: string,
): string {
  const wordmark =
    icon === "yeet" || icon === "yolo"
      ? wordmarkGraphic(icon, KEYCAP_ACCENT[icon] ?? "#D9DEE8")
      : undefined;
  const title = label.length > 12 ? `${label.slice(0, 11)}…` : label;
  const subtitle =
    description.length > 14 ? `${description.slice(0, 13)}…` : description;
  const accent = KEYCAP_ACCENT[icon] ?? "#AAB3BF";
  const iconScale = DETAILED_KEYCAP_ICONS.has(icon) ? 2.65 : 3;
  const iconTop = DETAILED_KEYCAP_ICONS.has(icon) ? 18 : 15;
  const glyph =
    wordmark ??
    (icon === "commit"
      ? `<circle cx="72" cy="52" r="34" fill="${accent}"/>
         ${commandIcon(icon, "#090B0F", 22, 2.5)}`
      : commandIcon(icon, accent, iconTop, iconScale));
  const caption = wordmark
    ? `<text x="72" y="126" text-anchor="middle" fill="#D5DAE2" font-family="-apple-system,system-ui,sans-serif" font-size="${SECONDARY_LABEL_SIZE}" font-weight="700">${escapeXml(subtitle)}</text>`
    : subtitle
      ? `<text x="72" y="109" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${PRIMARY_LABEL_SIZE}" font-weight="750">${escapeXml(title)}</text>
         <text x="72" y="127" text-anchor="middle" fill="#8D97A5" font-family="-apple-system,system-ui,sans-serif" font-size="${SECONDARY_LABEL_SIZE}" font-weight="700">${escapeXml(subtitle)}</text>`
      : `<text x="72" y="122" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${PRIMARY_LABEL_SIZE}" font-weight="750">${escapeXml(title)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    ${glyph}
    ${caption}
  </svg>`;
}

export function usageKeySvg(
  snapshot: UsageSnapshot | undefined,
  mode: "weekly" | "resets" = "weekly",
  now = Date.now(),
): string {
  const used = Math.round(snapshot?.usedPercent ?? 0);
  const remaining = Math.max(0, 100 - used);
  const color =
    snapshot === undefined
      ? "#6C7480"
      : used >= 90
        ? "#F85149"
        : used >= 70
          ? "#F4B740"
          : "#35C759";
  const resetMs = snapshot?.resetsAt
    ? Math.max(0, snapshot.resetsAt * 1000 - now)
    : undefined;
  const reset =
    resetMs === undefined
      ? "NO DATA"
      : resetMs >= 24 * 60 * 60 * 1000
        ? `${Math.ceil(resetMs / (24 * 60 * 60 * 1000))}D`
        : `${Math.max(1, Math.ceil(resetMs / (60 * 60 * 1000)))}H`;
  const mainValue =
    mode === "resets"
      ? snapshot?.resetsAvailable === undefined
        ? "NO DATA"
        : String(snapshot.resetsAvailable)
      : snapshot
        ? `${remaining}%`
        : "NO DATA";
  const heading = mode === "resets" ? "RESETS" : "WEEKLY LEFT";
  const footer =
    mode === "resets" ? "AVAILABLE" : snapshot ? `RESET ${reset}` : "";
  const valueSize = snapshot ? 40 : 22;
  const barWidth =
    snapshot && mode === "weekly" ? Math.round(104 * (remaining / 100)) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <text x="72" y="34" text-anchor="middle" fill="#B8C0CC" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="750" letter-spacing=".25">${heading}</text>
    <text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="${valueSize}" font-weight="800">${mainValue}</text>
    <rect x="20" y="96" width="104" height="8" rx="4" fill="#2B313B"/>
    <rect x="20" y="96" width="${barWidth}" height="8" rx="4" fill="${color}"/>
    <text x="72" y="127" text-anchor="middle" fill="${color}" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="750" letter-spacing=".35">${footer}</text>
  </svg>`;
}

export function contextKeySvg(
  snapshot: ContextSnapshot | undefined,
  mode: ContextView = "remaining",
): string {
  const known = snapshot !== undefined;
  const remaining = snapshot?.remainingPercent ?? 0;
  const used = Math.max(0, 100 - remaining);
  const color = !known
    ? "#6C7480"
    : used >= 90
      ? "#F85149"
      : used >= 70
        ? "#F4B740"
        : "#2F81F7";
  const compact = compactContext(snapshot).split("/");
  const usedValue = compact[0] ?? "--";
  const maxValue = compact[1] ?? "--";
  const barWidth = snapshot ? Math.round(104 * (used / 100)) : 0;
  const valueMarkup = !known
    ? '<text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="22" font-weight="800">NO DATA</text>'
    : mode === "exact"
      ? `<text x="72" y="65" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="24" font-weight="800">${usedValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">USED</tspan></text>
         <text x="72" y="88" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="21" font-weight="750">${maxValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">MAX</tspan></text>`
      : `<text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="38" font-weight="800">${remaining}%</text>`;
  const heading = mode === "remaining" && known ? "CONTEXT LEFT" : "CONTEXT";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <text x="72" y="34" text-anchor="middle" fill="#B8C0CC" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="750" letter-spacing=".25">${heading}</text>
    ${valueMarkup}
    <rect x="20" y="96" width="104" height="8" rx="4" fill="#2B313B"/>
    <rect x="20" y="96" width="${barWidth}" height="8" rx="4" fill="${color}"/>
  </svg>`;
}

export function healthKeySvg(
  component: string,
  value: string,
  healthy: boolean,
): string {
  const color = healthy ? "#35C759" : "#FF7373";
  const display = value.length > 14 ? `${value.slice(0, 13)}…` : value;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#090B0F"/>
    <circle cx="72" cy="52" r="27" fill="none" stroke="${color}" stroke-width="8"/>
    <path d="M55 52h10l6-14 9 29 7-15h10" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="103" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="800">${escapeXml(display.toUpperCase())}</text>
    <text x="72" y="124" text-anchor="middle" fill="#8D97A5" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="700">${escapeXml(component.toUpperCase())}</text>
  </svg>`;
}

/** Touch-strip payload for the shared `$B1` and command dial layouts. */
export interface DialFeedback {
  title: string;
  value: string;
  indicator: { value: number; bar_fill_c: string };
}

export function dialFailureFeedback(value: string): DialFeedback {
  return {
    title: "FAILED",
    value,
    indicator: { value: 0, bar_fill_c: "#FF453A" },
  };
}

export function statusIndicator(status: AgentStatus): {
  value: number;
  bar_fill_c: string;
} {
  return {
    value:
      status === "off"
        ? 0
        : status === "idle"
          ? 15
          : status === "thinking"
            ? 45
            : status === "running"
              ? 60
              : status === "unread"
                ? 80
                : 100,
    bar_fill_c: STATUS_COLOR[status],
  };
}
