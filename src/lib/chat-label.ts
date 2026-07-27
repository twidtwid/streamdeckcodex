import { basename } from "node:path";
import type { AgentSnapshot, SessionSnapshot } from "../types.js";

const MAX_LABEL_LENGTH = 7;

const STOP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "are",
  "at",
  "be",
  "because",
  "chat",
  "codex",
  "crashed",
  "directly",
  "do",
  "for",
  "from",
  "get",
  "i",
  "in",
  "install",
  "interactive",
  "is",
  "it",
  "make",
  "mode",
  "need",
  "new",
  "page",
  "please",
  "project",
  "reasoning",
  "reporting",
  "saved",
  "she",
  "still",
  "sure",
  "test",
  "that",
  "the",
  "this",
  "to",
  "using",
  "we",
  "what",
  "with",
  "work",
]);

const ABBREVIATIONS: Readonly<Record<string, string>> = {
  artifact: "Art",
  build: "Bld",
  cookie: "Ck",
  import: "Imp",
  reason: "Rsn",
  reasoning: "Rsn",
  report: "Rpt",
  terminal: "Term",
};

const ACRONYMS = new Set([
  "ai",
  "api",
  "ci",
  "html",
  "pr",
  "ptt",
  "qa",
  "sd",
  "ui",
]);

function words(input: string): string[] {
  return (
    input
      .replace(/<[^>]+>/g, " ")
      .replace(/^\/loop\b/i, " ")
      .replace(/^[\w'-]+\s+(?:is|was)\s+(?:asking|reporting|saying)\b/i, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .match(/[A-Za-z0-9]+/g) ?? []
  ).filter(
    (word) =>
      !STOP_WORDS.has(word.toLowerCase()) &&
      (word.length > 1 || /^\d+$/.test(word)),
  );
}

function displayWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function fitWords(input: string[]): string {
  const candidates = input.filter(Boolean);
  if (candidates.length === 0) return "Untitled";

  const firstRaw = candidates[0]!.toLowerCase();
  const first = ABBREVIATIONS[firstRaw] ?? displayWord(candidates[0]!);
  const secondRaw = candidates[1]?.toLowerCase();
  if (!secondRaw) return first.slice(0, MAX_LABEL_LENGTH);
  const second = displayWord(secondRaw);

  const spaced = `${first} ${second}`;
  if (spaced.length <= MAX_LABEL_LENGTH) return spaced;

  const joined = `${first}${second}`;
  if (joined.length <= MAX_LABEL_LENGTH) return joined;

  const shortSecond = ABBREVIATIONS[secondRaw] ?? second;
  const room = MAX_LABEL_LENGTH - first.length;
  if (room >= 2) return `${first}${shortSecond.slice(0, room)}`;
  return first.slice(0, MAX_LABEL_LENGTH);
}

function projectWords(cwd: string): string[] {
  const project = basename(cwd)
    .replace(/streamdeck/gi, "sd ")
    .replace(/codex/gi, "codex ")
    .replace(/realtime/gi, " ")
    .replace(/voice/gi, "voice ")
    .replace(/chat/gi, " ")
    .replace(/(?:app|test)$/i, "")
    .replace(/^pp/i, "");
  return project.match(/[A-Za-z0-9]+/g) ?? [];
}

export function compactChatLabel(
  thread: { displayTitle: string; cwd: string; title?: string },
  maxLength = MAX_LABEL_LENGTH,
): string {
  const title = thread.displayTitle.trim();
  const titleWords = words(title);
  const fromProject =
    /work directly in (?:the )?saved project/i.test(title) ||
    /<(?:codex|realtime)_delegation\b/i.test(thread.title ?? "") ||
    /^untitled(?: chat)?$/i.test(title) ||
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(title) ||
    titleWords.length === 0;
  const label = fitWords(fromProject ? projectWords(thread.cwd) : titleWords);
  return label.slice(0, Math.max(1, maxLength));
}

export function projectSessions(
  threads: readonly AgentSnapshot[],
  activeId?: string,
  maxLength = MAX_LABEL_LENGTH,
): SessionSnapshot[] {
  const used = new Set<string>();
  return threads.map((thread, sessionIndex) => {
    const base = compactChatLabel(thread, maxLength);
    let sessionLabel = base;
    let ordinal = 1;
    while (used.has(sessionLabel.toLowerCase())) {
      ordinal += 1;
      const suffix = String(ordinal);
      sessionLabel = `${base.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    }
    used.add(sessionLabel.toLowerCase());
    return {
      ...thread,
      sessionLabel,
      sessionIndex,
      isActive: thread.id === activeId,
    };
  });
}
