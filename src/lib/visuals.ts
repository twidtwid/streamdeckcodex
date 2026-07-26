import type {
  AgentSnapshot,
  AgentStatus,
  ContextSnapshot,
  SessionSnapshot,
  UsageSnapshot,
} from "../types.js";
import { compactContext, type ContextView } from "./context.js";
import { LUCIDE_PATHS } from "./lucide-paths.js";
import type { SessionDirection } from "./session-navigation.js";

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

export const STATUS_LABEL: Record<AgentStatus, string> = {
  off: "No chat",
  idle: "Idle",
  unread: "Unread",
  thinking: "Thinking",
  running: "Running",
  "needs-input": "Needs input",
  error: "Error",
};

export function marqueeText(
  text: string,
  width: number,
  now = Date.now(),
  stepMs = 500,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= width) return normalized;
  const track = `${normalized}   `;
  const offset = Math.floor(now / stepMs) % track.length;
  const repeated = `${track}${track}`;
  return repeated.slice(offset, offset + width);
}

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
  const label =
    snapshot && "sessionLabel" in snapshot
      ? snapshot.sessionLabel
      : (snapshot?.displayTitle ?? `Agent ${slot + 1}`);
  const isActive =
    snapshot && "isActive" in snapshot ? snapshot.isActive : false;
  const pulse = status === "thinking" || status === "running";
  const border = isActive
    ? "#FFFFFF"
    : status === "off"
      ? "#30363D"
      : status === "needs-input"
        ? NEEDS_INPUT_OUTLINE
        : color;
  const statusText =
    status === "off"
      ? "#6C7480"
      : status === "needs-input"
        ? NEEDS_INPUT_TEXT
        : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="${color}" fill-opacity="${status === "off" ? ".02" : isActive ? ".2" : ".12"}" stroke="${border}" stroke-width="${isActive ? 7 : 5}"${pulse ? ' stroke-dasharray="28 12"' : ""}/>
    ${isActive ? '<text x="23" y="28" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="9" font-weight="800">NOW</text>' : ""}
    <circle cx="72" cy="43" r="14" fill="${color}" fill-opacity="${status === "off" ? ".12" : ".95"}"/>
    <circle cx="72" cy="43" r="23" fill="none" stroke="${border}" stroke-width="3" opacity=".5"/>
    <text x="72" y="92" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="19" font-weight="800">${escapeXml(label)}</text>
    <text x="72" y="122" text-anchor="middle" fill="${statusText}" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="700">${escapeXml(STATUS_LABEL[status].toUpperCase())}</text>
    <text x="121" y="27" text-anchor="end" fill="#8B949E" font-family="monospace" font-size="12">${slot + 1}</text>
  </svg>`;
}

function commandIcon(icon: string, accent: string): string {
  const lucide = LUCIDE_PATHS[icon];
  if (lucide) {
    return `<g transform="translate(24 0) scale(4)" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${lucide}</g>`;
  }
  const common = `fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
  switch (icon) {
    case "accept":
      return `<circle cx="72" cy="51" r="27" ${common}/><path d="M57 51l10 10 21-22" ${common}/>`;
    case "reject":
      return `<circle cx="72" cy="51" r="27" ${common}/><path d="M59 38l26 26M85 38L59 64" ${common}/>`;
    case "dictate":
      return `<rect x="59" y="24" width="26" height="45" rx="13" ${common}/><path d="M48 57c0 15 10 25 24 25s24-10 24-25M72 82v13M59 95h26" ${common}/>`;
    case "new-chat":
      return `<path d="M43 31h45a13 13 0 0 1 13 13v27a13 13 0 0 1-13 13H65L48 96V84h-5a13 13 0 0 1-13-13V44a13 13 0 0 1 13-13z" ${common}/><path d="M72 44v27M59 57h26" ${common}/>`;
    case "send":
      return `<path d="M37 77l68-43-22 70-16-27-30 0zM67 77l20-22" ${common}/>`;
    case "fast":
      return `<path d="M78 20L45 61h24l-6 35 35-47H75l3-29z" ${common}/>`;
    case "plan":
      return `<path d="M38 32h14v14H38zM38 57h14v14H38zM38 82h14v14H38zM64 39h42M64 64h42M64 89h42" ${common}/>`;
    case "compact":
      return `<path d="M32 43h80M32 71h58M32 99h38M103 62l10 10-10 10" ${common}/>`;
    case "review":
      return `<path d="M48 27v52a17 17 0 0 0 17 17M48 46a20 20 0 0 0 20 20h18M86 51l15 15-15 15" ${common}/><circle cx="48" cy="27" r="7" fill="${accent}"/>`;
    case "skills":
      return `<path d="M72 22l7 20 20 7-20 7-7 20-7-20-20-7 20-7 7-20zM101 76l4 11 11 4-11 4-4 11-4-11-11-4 11-4 4-11z" ${common}/>`;
    case "debug":
      return `<path d="M51 46h42v34a21 21 0 0 1-42 0V46zM60 46V35M84 46V35M43 58H31M43 77H31M101 58h12M101 77h12M59 62h1M84 62h1" ${common}/>`;
    case "refactor":
      return `<path d="M38 37h31a18 18 0 0 1 18 18v33M76 77l11 11 11-11M106 91H75a18 18 0 0 1-18-18V40M68 51L57 40 46 51" ${common}/>`;
    case "tests":
      return `<path d="M50 25h44v16H50zM43 33h58v70H43zM55 67l11 11 23-25" ${common}/>`;
    case "back":
      return `<path d="M85 31L52 64l33 33M54 64h53" ${common}/>`;
    case "forward":
      return `<path d="M59 31l33 33-33 33M37 64h53" ${common}/>`;
    case "sidebar":
      return `<rect x="31" y="27" width="82" height="69" rx="10" ${common}/><path d="M57 27v69" ${common}/>`;
    case "terminal":
      return `<rect x="30" y="31" width="84" height="56" rx="9" ${common}/><path d="M48 48l13 11-13 11M70 70h25" ${common}/>`;
    case "edit":
      return `<path d="M42 88l7-23 38-38 16 16-38 38-23 7zM78 36l16 16" ${common}/>`;
    case "download":
      return `<path d="M72 24v48M53 54l19 19 19-19M39 91v13h66V91" ${common}/>`;
    case "trash":
      return `<path d="M43 42h58M58 42V30h28v12M49 42l4 60h38l4-60M62 57v30M82 57v30" ${common}/>`;
    case "openai":
      // Compact six-loop mark: recognisable at Stream Deck resolution without
      // pretending a generic flower is the OpenAI knot.
      return `<path d="M72 28c10-12 29-4 29 11 0 3-1 6-3 9 15 2 20 21 8 30-3 2-6 4-10 5 3 15-14 25-27 17-3-2-5-4-7-7-12 9-29-1-27-16 0-4 2-7 4-10-13-8-8-28 7-30 4 0 7 1 10 3 3-5 7-9 16-12z" ${common}/><path d="M72 42c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20zM54 47l18 15 18-15M54 77l18-15 18 15" ${common}/>`;
    case "yolo":
      return `<path d="M78 20L43 63h24l-5 39 38-48H76l2-34z" ${common}/><path d="M29 105h86" ${common}/>`;
    case "yeet":
      return `<path d="M38 77l68-43-22 70-16-27-30 0zM67 77l20-22" ${common}/><path d="M98 25h15v15" ${common}/>`;
    case "context":
      return `<rect x="34" y="29" width="76" height="69" rx="9" ${common}/><path d="M50 48h44M50 65h30M50 82h20" ${common}/>`;
    case "usage":
      return `<path d="M42 92V68M62 92V48M82 92V60M102 92V34M34 102h76" ${common}/>`;
    case "model":
      return `<path d="M72 22l36 20v40l-36 20-36-20V42l36-20zM36 42l36 20 36-20M72 62v40" ${common}/>`;
    case "reasoning":
      return `<path d="M51 89c-8-6-13-15-13-26 0-20 15-36 34-36s34 16 34 36c0 11-5 20-13 26M55 104h34M59 91h26" ${common}/><path d="M60 61h1M84 61h1" ${common}/>`;
    case "clock":
      return `<circle cx="72" cy="61" r="34" ${common}/><path d="M72 42v21l15 10" ${common}/>`;
    case "settings":
      return `<circle cx="72" cy="61" r="12" ${common}/><path d="M72 25v13M72 84v13M36 61h13M95 61h13M46 35l9 9M89 78l9 9M98 35l-9 9M55 78l-9 9" ${common}/>`;
    case "folder":
      return `<path d="M31 45h31l9 10h42v39H31zM38 70h68" ${common}/>`;
    case "folder-plus":
      return `<path d="M31 45h31l9 10h42v39H31zM38 70h68M91 55v25M79 67h24" ${common}/>`;
    case "inbox":
      return `<path d="M34 39h76v56H34zM34 72h20l7 10h22l7-10h20M72 45v19M62 55h20" ${common}/>`;
    case "play":
      return `<path d="M57 34l43 27-43 27z" ${common}/>`;
    case "branch-back":
      return `<circle cx="49" cy="36" r="8" ${common}/><circle cx="49" cy="91" r="8" ${common}/><circle cx="96" cy="91" r="8" ${common}/><path d="M49 44v39M49 63h25c12 0 22 10 22 20M78 53L65 63l13 10" ${common}/>`;
    case "branch-add":
      return `<circle cx="49" cy="36" r="8" ${common}/><circle cx="49" cy="91" r="8" ${common}/><circle cx="96" cy="91" r="8" ${common}/><path d="M49 44v39M49 63h25c12 0 22 10 22 20M95 32v20M85 42h20" ${common}/>`;
    case "merge":
      return `<circle cx="49" cy="36" r="8" ${common}/><circle cx="49" cy="91" r="8" ${common}/><circle cx="96" cy="91" r="8" ${common}/><path d="M49 44v39M49 63h25c12 0 22 10 22 20M96 44v39" ${common}/>`;
    case "paint":
      return `<path d="M47 79l12-12 37-37 13 13-37 37-12 12-20 5zM87 39l13 13M40 97l20-5" ${common}/>`;
    case "confetti":
      return `<path d="M42 87l24-24 18 18-24 24-20 5zM38 49l12 6M56 34l4 13M88 38l-8 11M101 56l-14 2M95 91l-11-8" ${common}/>`;
    case "brain-medium":
      return `<path d="M56 91c-11-5-18-16-18-29 0-19 15-35 34-35s34 16 34 35c0 13-7 24-18 29M59 91h26M55 51c8-5 16-5 24 0M58 68h1M85 68h1" ${common}/>`;
    case "brain-outline":
      return `<path d="M56 91c-11-5-18-16-18-29 0-19 15-35 34-35s34 16 34 35c0 13-7 24-18 29M59 91h26M72 32v53M51 52h42M53 70h38" ${common}/>`;
    case "bolt":
      return `<path d="M78 20L45 61h24l-6 35 35-47H75l3-29z" ${common}/>`;
    case "enter":
      return `<path d="M35 61h52M71 42l19 19-19 19M90 35h17v52H73" ${common}/>`;
    case "cloud-upload":
      return `<path d="M43 88h54a20 20 0 0 0 1-40 28 28 0 0 0-53 8 16 16 0 0 0-2 32zM72 91V52M58 66l14-14 14 14" ${common}/>`;
    case "apps":
      return `<circle cx="52" cy="42" r="8" fill="${accent}"/><circle cx="92" cy="42" r="8" fill="${accent}"/><circle cx="52" cy="82" r="8" fill="${accent}"/><circle cx="92" cy="82" r="8" fill="${accent}"/>`;
    case "cloud":
      return `<path d="M43 88h54a20 20 0 0 0 1-40 28 28 0 0 0-53 8 16 16 0 0 0-2 32z" ${common}/>`;
    case "sessions":
      return `<rect x="32" y="29" width="80" height="58" rx="9" ${common}/><path d="M45 45h54M45 61h38M45 77h23M52 101h40" ${common}/>`;
    case "goal":
      return `<circle cx="72" cy="61" r="35" ${common}/><circle cx="72" cy="61" r="16" ${common}/><path d="M72 20v16M72 86v16M31 61h16M97 61h16" ${common}/>`;
    case "search":
      return `<circle cx="63" cy="57" r="25" ${common}/><path d="M82 77l22 22" ${common}/>`;
    case "branch":
      return `<circle cx="49" cy="36" r="8" ${common}/><circle cx="49" cy="91" r="8" ${common}/><circle cx="96" cy="91" r="8" ${common}/><path d="M49 44v39M49 63h25c12 0 22 10 22 20" ${common}/>`;
    case "diff":
      return `<path d="M38 46h68M38 78h68M55 32v28M89 64v28" ${common}/>`;
    case "commit":
      return `<path d="M38 40h68l12 21-12 21H38L26 61l12-21z" ${common}/><circle cx="72" cy="61" r="8" fill="${accent}"/>`;
    case "deploy":
      return `<path d="M72 99V29M52 49l20-20 20 20M38 105h68" ${common}/>`;
    default:
      return `<circle cx="72" cy="57" r="30" ${common}/><path d="M52 57h40" ${common}/>`;
  }
}

export function commandKeySvg(
  label: string,
  accent = "#2F81F7",
  icon = "command",
  modeState?: "ACTIVE" | "OFF",
): string {
  const [first, second] = titleLines(label);
  const stateMarkup = modeState
    ? `<rect x="41" y="13" width="62" height="18" rx="9" fill="${modeState === "ACTIVE" ? "#35C759" : "#6C7480"}"/>
       <text x="72" y="26" text-anchor="middle" fill="#0B0D10" font-family="-apple-system,system-ui,sans-serif" font-size="10" font-weight="800">${modeState}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-opacity=".45" stroke-width="3"/>
    ${stateMarkup}
    ${commandIcon(icon, accent)}
    <text x="72" y="116" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="16" font-weight="700">${escapeXml(first)}</text>
    <text x="72" y="133" text-anchor="middle" fill="#B7BDC8" font-family="-apple-system,system-ui,sans-serif" font-size="12">${escapeXml(second)}</text>
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
  const title = label.length > 11 ? `${label.slice(0, 10)}…` : label;
  const subtitle =
    description.length > 14 ? `${description.slice(0, 13)}…` : description;
  const glyph = commandIcon(icon, "#F2F5F8");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="#161A20" stroke="#69717D" stroke-width="3"/>
    <rect x="15" y="15" width="114" height="114" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity=".1"/>
    <g transform="translate(18 4) scale(.75)">${glyph}</g>
    <text x="72" y="108" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="750">${escapeXml(title)}</text>
    <text x="72" y="126" text-anchor="middle" fill="#AAB3BF" font-family="-apple-system,system-ui,sans-serif" font-size="10" font-weight="700" letter-spacing=".35">${escapeXml(subtitle)}</text>
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
        ? `${Math.ceil(resetMs / (24 * 60 * 60 * 1000))} DAYS`
        : `${Math.max(1, Math.ceil(resetMs / (60 * 60 * 1000)))} HOURS`;
  const mainValue =
    mode === "resets"
      ? snapshot?.resetsAvailable === undefined
        ? "--"
        : String(snapshot.resetsAvailable)
      : snapshot
        ? `${remaining}%`
        : "--";
  const heading = mode === "resets" ? "RESETS LEFT" : "WEEK LEFT";
  const footer = mode === "resets" ? "BANKED" : reset;
  const barWidth =
    snapshot && mode === "weekly" ? Math.round(104 * (remaining / 100)) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="${color}" fill-opacity=".08" stroke="${color}" stroke-opacity=".5" stroke-width="3"/>
    <text x="72" y="36" text-anchor="middle" fill="#C6CCD5" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="700">${heading}</text>
    <text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="38" font-weight="800">${mainValue}</text>
    <rect x="20" y="94" width="104" height="9" rx="4.5" fill="#30363D"/>
    <rect x="20" y="94" width="${barWidth}" height="9" rx="4.5" fill="${color}"/>
    <text x="72" y="122" text-anchor="middle" fill="${color}" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="700">${footer}</text>
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
  const valueMarkup =
    mode === "exact"
      ? `<text x="72" y="65" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="24" font-weight="800">${usedValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">USED</tspan></text>
         <text x="72" y="88" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="21" font-weight="750">${maxValue} <tspan fill="#9DA5B2" font-size="10" font-weight="700">MAX</tspan></text>`
      : `<text x="72" y="82" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,system-ui,sans-serif" font-size="38" font-weight="800">${snapshot ? `${remaining}%` : "--"}</text>`;
  const footer =
    mode === "remaining"
      ? `<text x="72" y="122" text-anchor="middle" fill="${color}" font-family="-apple-system,system-ui,sans-serif" font-size="11" font-weight="700">LEFT</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="${color}" fill-opacity=".08" stroke="${color}" stroke-opacity=".5" stroke-width="3"/>
    <text x="72" y="36" text-anchor="middle" fill="#C6CCD5" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="700">CONTEXT</text>
    ${valueMarkup}
    <rect x="20" y="94" width="104" height="9" rx="4.5" fill="#30363D"/>
    <rect x="20" y="94" width="${barWidth}" height="9" rx="4.5" fill="${color}"/>
    ${footer}
  </svg>`;
}

export type SessionNavigationVisualState =
  "available" | "opened" | "no-chat" | "oldest" | "newest" | "failed";

export function sessionNavigationKeySvg(
  direction: SessionDirection,
  state: SessionNavigationVisualState = "available",
  sessionStatus?: AgentStatus,
): string {
  const isOlder = direction === "older";
  const stateAccent =
    state === "failed" || state === "no-chat"
      ? "#F85149"
      : state === "opened"
        ? "#35C759"
        : state === "oldest" || state === "newest"
          ? "#6C7480"
          : "#2F81F7";
  const showsSessionStatus =
    sessionStatus !== undefined &&
    (state === "available" || state === "opened");
  const accent = showsSessionStatus ? STATUS_COLOR[sessionStatus] : stateAccent;
  const outline =
    showsSessionStatus && sessionStatus === "needs-input"
      ? NEEDS_INPUT_OUTLINE
      : accent;
  const statusText =
    showsSessionStatus && sessionStatus === "needs-input"
      ? NEEDS_INPUT_TEXT
      : accent;
  const outlineOpacity =
    showsSessionStatus && sessionStatus === "needs-input" ? ".7" : ".5";
  const status =
    state === "available"
      ? "SESSION"
      : state === "opened"
        ? "OPENED"
        : state === "no-chat"
          ? "NO CHAT"
          : state === "failed"
            ? "FAILED"
            : state.toUpperCase();
  const arrow = isOlder
    ? `<path d="M91 42L58 72l33 30M59 72h49" />`
    : `<path d="M53 42l33 30-33 30M36 72h49" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="18" fill="#0B0D10"/>
    <rect x="10" y="10" width="124" height="124" rx="28" fill="${accent}" fill-opacity=".08" stroke="${outline}" stroke-opacity="${outlineOpacity}" stroke-width="3"/>
    <text x="72" y="31" text-anchor="middle" fill="#C6CCD5" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="750">${isOlder ? "PREVIOUS" : "NEXT"}</text>
    <g fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${arrow}</g>
    <text x="72" y="125" text-anchor="middle" fill="${statusText}" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="750">${status}</text>
  </svg>`;
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
