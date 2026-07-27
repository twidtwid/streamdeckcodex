import { describe, expect, it } from "vitest";
import {
  codexDeepLink,
  newChatDeepLink,
  threadDeepLink,
} from "../src/lib/deep-links.js";

describe("Codex deep links", () => {
  it("builds safe thread links", () => {
    expect(threadDeepLink("019f9a17-22f4-70f2-a6b9-e62daadb016e")).toBe(
      "codex://threads/019f9a17-22f4-70f2-a6b9-e62daadb016e",
    );
    expect(() => threadDeepLink("../../Applications")).toThrow();
  });

  it("encodes new-chat prompt and path", () => {
    const link = newChatDeepLink({
      prompt: "Review & test",
      path: "/tmp/Project Name",
    });
    expect(link).toContain("codex://threads/new?");
    expect(link).toContain("prompt=Review+%26+test");
    expect(link).toContain("path=%2Ftmp%2FProject+Name");
  });

  it("limits fixed navigation links to known surfaces", () => {
    expect(codexDeepLink("skills")).toBe("codex://skills");
  });
});
