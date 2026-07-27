import { DeviceType } from "@elgato/streamdeck";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PROFILE_VERSION,
  bundledProfileForDevice,
} from "../src/lib/bundled-profiles.js";

describe("bundled profiles", () => {
  it("maps each supported key device to its exact profile", () => {
    expect(bundledProfileForDevice(DeviceType.StreamDeck)).toBe(
      "streamdeckcodex-stream-deck",
    );
    expect(bundledProfileForDevice(DeviceType.StreamDeckMini)).toBe(
      "streamdeckcodex-mini",
    );
    expect(bundledProfileForDevice(DeviceType.StreamDeckXL)).toBe(
      "streamdeckcodex-xl",
    );
    expect(bundledProfileForDevice(DeviceType.StreamDeckPlus)).toBe(
      "streamdeckcodex-plus",
    );
    expect(bundledProfileForDevice(DeviceType.StreamDeckNeo)).toBe(
      "streamdeckcodex-neo",
    );
  });

  it("does not claim a bundled profile for unsupported hardware", () => {
    expect(bundledProfileForDevice(DeviceType.StreamDeckPedal)).toBeUndefined();
  });

  it("uses a new activation version for the expanded profile family", () => {
    expect(BUNDLED_PROFILE_VERSION).toBe("profiles-v2");
  });
});
