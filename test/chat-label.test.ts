import { describe, expect, it } from "vitest";
import { compactChatLabel, projectSessions } from "../src/lib/chat-label.js";
import type { AgentSnapshot } from "../src/types.js";

describe("compact chat labels", () => {
  it("uses the project name when delegation boilerplate hides the subject", () => {
    expect(
      compactChatLabel({
        displayTitle:
          "Work directly in the saved project “streamdeckcodex.” The user confirms all existing work is theirs.",
        cwd: "/Users/example/Documents/streamdeckcodex",
      }),
    ).toBe("SDCodex");
  });

  it("uses stable project identity for delegated source and worker tasks", () => {
    expect(
      compactChatLabel({
        title:
          "<realtime_delegation><input>Okay, new repo, new project</input>",
        displayTitle: "Okay, new repo, new project",
        cwd: "/Users/example/Documents/Codex/realtime-voice-chat",
      }),
    ).toBe("Voice");
    expect(
      compactChatLabel({
        title:
          "<codex_delegation><input>Work directly in the saved project</input>",
        displayTitle: "Work directly in the saved project",
        cwd: "/Users/example/Documents/streamdeckcodex",
      }),
    ).toBe("SDCodex");
  });

  it("keeps short subjects recognizable", () => {
    expect(
      compactChatLabel({
        displayTitle: "Codex Ultra Reasoning",
        cwd: "/tmp/realtime-voice-chat",
      }),
    ).toBe("Ultra");
    expect(
      compactChatLabel({
        displayTitle: "New voice chat (2)",
        cwd: "/tmp/realtime-voice-chat",
      }),
    ).toBe("Voice 2");
  });

  it("removes conversational filler from issue titles", () => {
    expect(
      compactChatLabel({
        displayTitle:
          "Amelia is reporting she's still using an old build because newer TestFlights do not show the postcards.",
        cwd: "/tmp/PostcardApp",
      }),
    ).toBe("OldBld");
  });

  it("never emits an ellipsis or exceeds the touch-strip budget", () => {
    const label = compactChatLabel({
      displayTitle:
        "terminal crashed, i need that html artifact report you were working on",
      cwd: "/tmp/lagunatest",
    });

    expect(label).toBe("TermHTM");
    expect(label.length).toBeLessThanOrEqual(7);
    expect(label).not.toContain("...");
  });

  it("deduplicates deterministically without changing order or exposing IDs", () => {
    const make = (id: string, displayTitle: string): AgentSnapshot => ({
      id,
      rolloutPath: `/tmp/${id}.jsonl`,
      cwd: "/tmp/streamdeckcodex",
      title: displayTitle,
      preview: displayTitle,
      recencyAtMs: 1,
      displayTitle,
      status: "idle",
      detail: "Idle",
      lastEventAt: 1,
    });
    const projected = projectSessions(
      [
        make("newest-id", "Fix context display"),
        make("middle-id", "Fix context display"),
        make("oldest-id", "Fix context display"),
      ],
      "middle-id",
    );

    expect(projected.map((session) => session.id)).toEqual([
      "newest-id",
      "middle-id",
      "oldest-id",
    ]);
    expect(projected.map((session) => session.sessionLabel)).toEqual([
      "FixCont",
      "FixCon2",
      "FixCon3",
    ]);
    expect(projected.map((session) => session.isActive)).toEqual([
      false,
      true,
      false,
    ]);
    expect(projected.every((session) => session.sessionLabel.length <= 7)).toBe(
      true,
    );
  });

  it("falls back to the project for raw IDs and untitled sessions", () => {
    expect(
      compactChatLabel({
        displayTitle: "019f9a12-a287-72a2-bc79-d26a3e2b0cb5",
        cwd: "/tmp/streamdeckcodex",
      }),
    ).toBe("SDCodex");
    expect(
      compactChatLabel({
        displayTitle: "Untitled chat",
        cwd: "/tmp/PostcardApp",
      }),
    ).toBe("Postcar");
  });
});
