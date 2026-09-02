import { describe, expect, it } from "vitest";
import {
  BoundedLineBuffer,
  ProcessOutputLimitError,
} from "../src/lib/bounded-process.js";

describe("bounded process output", () => {
  it("caps each JSON line without rejecting a burst of complete lines", () => {
    const buffer = new BoundedLineBuffer(8, "fixture");

    expect(buffer.append("one\ntwo\nthree\n")).toEqual(["one", "two", "three"]);
  });

  it("rejects an oversized complete or pending line", () => {
    const complete = new BoundedLineBuffer(4, "fixture");
    const pending = new BoundedLineBuffer(4, "fixture");

    expect(() => complete.append("12345\n")).toThrow(ProcessOutputLimitError);
    expect(() => pending.append("12345")).toThrow(ProcessOutputLimitError);
  });
});
