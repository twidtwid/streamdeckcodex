const THREAD_ID = /^[0-9a-f-]{16,64}$/i;

export function threadDeepLink(threadId: string): string {
  if (!THREAD_ID.test(threadId)) throw new Error("Invalid Codex thread id");
  return `codex://threads/${threadId}`;
}

export function newChatDeepLink(
  options: {
    prompt?: string;
    path?: string;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.prompt) params.set("prompt", options.prompt);
  if (options.path) params.set("path", options.path);
  const query = params.toString();
  return `codex://threads/new${query ? `?${query}` : ""}`;
}

export function codexDeepLink(
  path: "skills" | "settings" | "automations",
): string {
  return `codex://${path}`;
}
