import { describe, expect, it, vi } from "vitest";
import {
  CodexStore,
  LIVE_COMPOSER_CACHE_MS,
  applyFocusedLiveInput,
} from "../src/lib/codex-store.js";
import type { AgentSnapshot } from "../src/types.js";

function snapshot(id: string, status: AgentSnapshot["status"]): AgentSnapshot {
  return {
    id,
    rolloutPath: `/tmp/${id}.jsonl`,
    cwd: "/tmp/streamdeckcodex",
    title: id,
    preview: id,
    displayTitle: id,
    recencyAtMs: 1,
    lastEventAt: 1,
    status,
    detail: status,
  };
}

describe("focused native approval status", () => {
  it("reuses one fresh snapshot across consumers, then reads on the next cadence", async () => {
    let now = 10_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const reader = vi.fn(async () => ({
      pendingInput: false,
      approvalMode: "ask" as const,
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    }));
    const store = new CodexStore({
      activeThreadId: () => "focused",
      liveComposerReader: reader,
    });
    try {
      await store.refreshLiveComposer();
      await Promise.all([
        store.refreshLiveComposer(),
        store.refreshLiveComposer(),
        store.refreshLiveComposer(),
      ]);
      expect(reader).toHaveBeenCalledTimes(1);

      now += LIVE_COMPOSER_CACHE_MS - 1;
      await store.refreshLiveComposer();
      expect(reader).toHaveBeenCalledTimes(1);

      now += 2;
      await store.refreshLiveComposer();
      expect(reader).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("serializes forced requests made during an active read", async () => {
    let release!: () => void;
    let calls = 0;
    const state = {
      pendingInput: false,
      approvalMode: "ask" as const,
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    };
    const store = new CodexStore({
      activeThreadId: () => "focused",
      liveComposerReader: async () => {
        calls += 1;
        if (calls === 1)
          await new Promise<void>((resolve) => (release = resolve));
        return state;
      },
    });
    const initial = store.refreshLiveComposer();
    void store.refreshLiveComposer(true);
    void store.refreshLiveComposer(true);
    release();
    await initial;
    expect(calls).toBe(2);
  });

  it("single-flights composer reads and keeps a pre-mutation read stale", async () => {
    let resolveStale!: (state: {
      pendingInput: boolean;
      approvalMode: "ask";
      conversationId: string;
      rendererWindowId: string;
    }) => void;
    let reads = 0;
    const store = new CodexStore({
      activeThreadId: () => "focused",
      liveComposerReader: async () => {
        reads += 1;
        if (reads === 1) {
          return new Promise((resolve) => (resolveStale = resolve));
        }
        return {
          pendingInput: false,
          approvalMode: "custom",
          conversationId: "focused",
          rendererWindowId: "renderer-focused",
        };
      },
      approvalCycler: async () => ({
        pendingInput: false,
        approvalMode: "custom",
        conversationId: "focused",
        rendererWindowId: "renderer-focused",
      }),
    });
    const stale = store.refreshLiveComposer();
    void store.refreshLiveComposer();
    expect(reads).toBe(1);

    await expect(store.cycleLiveComposerApprovalMode()).resolves.toBe("custom");
    resolveStale({
      pendingInput: false,
      approvalMode: "ask",
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    });
    await stale;
    expect(store.liveComposerState()?.approvalMode).toBe("custom");
  });

  it("overrides only the focused running task while approval is pending", () => {
    const result = applyFocusedLiveInput(
      [snapshot("focused", "running"), snapshot("background", "unread")],
      "focused",
      {
        pendingInput: true,
        inputKind: "approval",
        conversationId: "focused",
        rendererWindowId: "renderer-focused",
      },
    );

    expect(result).toMatchObject([
      {
        id: "focused",
        status: "needs-input",
        detail: "Approval required",
      },
      { id: "background", status: "unread", detail: "unread" },
    ]);
  });

  it("restores the rollout-derived state when the live prompt clears", () => {
    const persisted = [snapshot("focused", "running")];
    const pending = applyFocusedLiveInput(persisted, "focused", {
      pendingInput: true,
      inputKind: "approval",
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    });
    const cleared = applyFocusedLiveInput(persisted, "focused", {
      pendingInput: false,
      conversationId: "focused",
      rendererWindowId: "renderer-focused",
    });

    expect(pending[0]?.status).toBe("needs-input");
    expect(cleared[0]).toBe(persisted[0]);
    expect(cleared[0]?.status).toBe("running");
  });

  it("never reconstructs a pending approval onto a non-focused title", () => {
    const sessions = [
      { ...snapshot("newest", "running"), title: "Different focused chat" },
      {
        ...snapshot("approval-owner", "running"),
        title: "Make an interactive HTML page that labels chocolates",
      },
    ];

    const result = applyFocusedLiveInput(sessions, "newest", {
      pendingInput: true,
      inputKind: "approval",
      inputTitle: "Make an interactive HTML page that labels chocolates",
      conversationId: "newest",
      rendererWindowId: "renderer-newest",
    });

    expect(result[0]).toMatchObject({ id: "newest", status: "needs-input" });
    expect(result[1]?.status).toBe("running");
  });

  it("fails closed for unknown input state or an unrelated focused task", () => {
    const persisted = [snapshot("visible", "thinking")];

    expect(applyFocusedLiveInput(persisted, "visible", undefined)).toBe(
      persisted,
    );
    expect(
      applyFocusedLiveInput(persisted, "other", {
        pendingInput: true,
        inputKind: "approval",
        conversationId: "other",
        rendererWindowId: "renderer-other",
      }),
    ).toEqual(persisted);
  });
});
