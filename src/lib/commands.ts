export type CommandMode = "shortcut" | "slash" | "deep-link" | "mode-toggle";

export interface CommandDefinition {
  id: string;
  label: string;
  dialLabel?: string;
  mode: CommandMode;
  value: string;
  accent: string;
  icon: string;
}

export const COMMANDS: readonly CommandDefinition[] = [
  {
    id: "accept",
    label: "Accept",
    mode: "shortcut",
    value: "accept",
    accent: "#35C759",
    icon: "accept",
  },
  {
    id: "reject",
    label: "Reject",
    mode: "shortcut",
    value: "reject",
    accent: "#F85149",
    icon: "reject",
  },
  {
    id: "dictate",
    label: "PTT",
    dialLabel: "PTT",
    mode: "shortcut",
    value: "dictation-down",
    accent: "#A371F7",
    icon: "dictate",
  },
  {
    id: "new-chat",
    label: "New chat",
    dialLabel: "NEW",
    mode: "deep-link",
    value: "codex://threads/new",
    accent: "#2F81F7",
    icon: "new-chat",
  },
  {
    id: "send",
    label: "Send",
    mode: "shortcut",
    value: "send",
    accent: "#2F81F7",
    icon: "send",
  },
  {
    id: "skills",
    label: "Skills",
    mode: "deep-link",
    value: "codex://skills",
    accent: "#F4B740",
    icon: "skills",
  },
  {
    id: "fast",
    label: "FAST",
    dialLabel: "Fast",
    mode: "mode-toggle",
    value: "fast",
    accent: "#F4B740",
    icon: "fast",
  },
  {
    id: "plan",
    label: "Plan mode",
    dialLabel: "Plan",
    mode: "mode-toggle",
    value: "plan",
    accent: "#A371F7",
    icon: "plan",
  },
  {
    id: "compact",
    label: "Compact",
    dialLabel: "Compact",
    mode: "slash",
    value: "/compact",
    accent: "#9CD5FE",
    icon: "compact",
  },
  {
    id: "sidebar",
    label: "Sidebar",
    mode: "shortcut",
    value: "sidebar",
    accent: "#8B949E",
    icon: "sidebar",
  },
  {
    id: "settings",
    label: "Settings",
    mode: "shortcut",
    value: "settings",
    accent: "#D9DEE8",
    icon: "settings",
  },
  {
    id: "review-panel",
    label: "Review",
    mode: "shortcut",
    value: "review-panel",
    accent: "#C8A4FF",
    icon: "review",
  },
  {
    id: "browser",
    label: "Browser",
    mode: "shortcut",
    value: "browser",
    accent: "#79C0FF",
    icon: "browser",
  },
  {
    id: "files",
    label: "Files",
    mode: "shortcut",
    value: "files",
    accent: "#9CD5FE",
    icon: "files",
  },
  {
    id: "side-chat",
    label: "Side chat",
    mode: "shortcut",
    value: "side-chat",
    accent: "#C8A4FF",
    icon: "side-chat",
  },
] as const;

export function commandAt(index: number): CommandDefinition {
  const wrapped =
    ((index % COMMANDS.length) + COMMANDS.length) % COMMANDS.length;
  return COMMANDS[wrapped] ?? COMMANDS[0]!;
}

/**
 * The encoder is intentionally curated: frequent mode controls first, then
 * Codex's direct workspace surfaces. The keypad keeps the larger command
 * catalog. Do not silently repopulate this from COMMANDS.
 */
export const DIAL_COMMANDS: readonly CommandDefinition[] = [
  COMMANDS.find(({ id }) => id === "fast")!,
  COMMANDS.find(({ id }) => id === "plan")!,
  COMMANDS.find(({ id }) => id === "compact")!,
  COMMANDS.find(({ id }) => id === "review-panel")!,
  COMMANDS.find(({ id }) => id === "browser")!,
  COMMANDS.find(({ id }) => id === "files")!,
  COMMANDS.find(({ id }) => id === "side-chat")!,
] as const;

export function dialCommandAt(index: number): CommandDefinition {
  const wrapped =
    ((index % DIAL_COMMANDS.length) + DIAL_COMMANDS.length) %
    DIAL_COMMANDS.length;
  return DIAL_COMMANDS[wrapped] ?? DIAL_COMMANDS[0]!;
}
