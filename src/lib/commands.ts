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
    label: "Push to talk",
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
    id: "review",
    label: "Review",
    mode: "slash",
    value: "/review",
    accent: "#A371F7",
    icon: "review",
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
    label: "Fast mode",
    dialLabel: "FAST",
    mode: "mode-toggle",
    value: "fast",
    accent: "#F4B740",
    icon: "fast",
  },
  {
    id: "plan",
    label: "Plan mode",
    dialLabel: "PLAN",
    mode: "mode-toggle",
    value: "plan",
    accent: "#A371F7",
    icon: "plan",
  },
  {
    id: "compact",
    label: "Compact",
    dialLabel: "COMPACT",
    mode: "slash",
    value: "/compact",
    accent: "#9CD5FE",
    icon: "compact",
  },
  {
    id: "back",
    label: "Back",
    mode: "shortcut",
    value: "back",
    accent: "#8B949E",
    icon: "back",
  },
  {
    id: "forward",
    label: "Forward",
    mode: "shortcut",
    value: "forward",
    accent: "#8B949E",
    icon: "forward",
  },
  {
    id: "sidebar",
    label: "Sidebar",
    mode: "shortcut",
    value: "sidebar",
    accent: "#8B949E",
    icon: "sidebar",
  },
] as const;

export function commandAt(index: number): CommandDefinition {
  const wrapped =
    ((index % COMMANDS.length) + COMMANDS.length) % COMMANDS.length;
  return COMMANDS[wrapped] ?? COMMANDS[0]!;
}
