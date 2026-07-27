import { describe, expect, it } from "vitest";
import { renderFeedback, renderKey } from "../src/lib/render-cache.js";

describe("render transport cache", () => {
  it("deduplicates equal key and feedback payloads but retries failed sends", async () => {
    const calls: string[] = [];
    let fail = true;
    const key = {
      setImage: async (value: string) => {
        calls.push(`image:${value}`);
        if (fail) {
          fail = false;
          throw new Error("transport failed");
        }
      },
      setTitle: async (value: string) => {
        calls.push(`title:${value}`);
      },
    };
    await expect(renderKey(key, "one")).rejects.toThrow("transport failed");
    await renderKey(key, "one");
    await renderKey(key, "one");
    await renderKey(key, "two");
    expect(calls).toEqual(["image:one", "image:one", "title:", "image:two"]);

    const feedbacks: unknown[] = [];
    const dial = {
      setFeedback: async (value: unknown) => {
        feedbacks.push(value);
      },
    };
    await renderFeedback(dial, { title: "A", value: "1" });
    await renderFeedback(dial, { title: "A", value: "1" });
    await renderFeedback(dial, { title: "B", value: "1" });
    expect(feedbacks).toEqual([
      { title: "A", value: "1" },
      { title: "B", value: "1" },
    ]);

    let failFeedback = true;
    const retryingDial = {
      setFeedback: async () => {
        if (failFeedback) {
          failFeedback = false;
          throw new Error("feedback transport failed");
        }
      },
    };
    await expect(
      renderFeedback(retryingDial, { value: "retry" }),
    ).rejects.toThrow("feedback transport failed");
    await expect(
      renderFeedback(retryingDial, { value: "retry" }),
    ).resolves.toBeUndefined();
  });

  it("retries a failed title without resending the already acknowledged image", async () => {
    const calls: string[] = [];
    let failTitle = true;
    const key = {
      setImage: async (value: string) => {
        calls.push(`image:${value}`);
      },
      setTitle: async (value: string) => {
        calls.push(`title:${value}`);
        if (failTitle) {
          failTitle = false;
          throw new Error("title transport failed");
        }
      },
    };

    await expect(renderKey(key, "one")).rejects.toThrow(
      "title transport failed",
    );
    await renderKey(key, "one");
    expect(calls).toEqual(["image:one", "title:", "title:"]);
  });

  it("coalesces concurrent equal renders and serializes changed payloads", async () => {
    let releaseImage!: () => void;
    const images: string[] = [];
    const titles: string[] = [];
    const key = {
      setImage: async (value: string) => {
        images.push(value);
        if (value === "one") {
          await new Promise<void>((resolve) => {
            releaseImage = resolve;
          });
        }
      },
      setTitle: async (value: string) => {
        titles.push(value);
      },
    };
    const firstKey = renderKey(key, "one");
    const sameKey = renderKey(key, "one");
    const changedKey = renderKey(key, "two");
    await Promise.resolve();
    expect(images).toEqual(["one"]);
    releaseImage();
    await Promise.all([firstKey, sameKey, changedKey]);
    await renderKey(key, "two");
    expect(images).toEqual(["one", "two"]);
    expect(titles).toEqual([""]);

    let releaseFeedback!: () => void;
    const feedbacks: string[] = [];
    const dial = {
      setFeedback: async (value: unknown) => {
        const payload = value as { value: string };
        feedbacks.push(payload.value);
        if (payload.value === "one") {
          await new Promise<void>((resolve) => {
            releaseFeedback = resolve;
          });
        }
      },
    };
    const firstFeedback = renderFeedback(dial, { value: "one" });
    const sameFeedback = renderFeedback(dial, { value: "one" });
    const changedFeedback = renderFeedback(dial, { value: "two" });
    await Promise.resolve();
    expect(feedbacks).toEqual(["one"]);
    releaseFeedback();
    await Promise.all([firstFeedback, sameFeedback, changedFeedback]);
    await renderFeedback(dial, { value: "two" });
    expect(feedbacks).toEqual(["one", "two"]);
  });
});
