import { DeviceType } from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PROFILE_VERSION,
  bundledProfileForDevice,
  bundledProfileTargets,
  bundledProfileTargetsVisible,
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
    expect(BUNDLED_PROFILE_VERSION).toBe("profiles-v3");
  });

  it("activates only connected supported devices", () => {
    const targets = bundledProfileTargets([
      {
        id: "plus",
        type: DeviceType.StreamDeckPlus,
        isConnected: true,
        actions: [],
      },
      {
        id: "offline-xl",
        type: DeviceType.StreamDeckXL,
        isConnected: false,
        actions: [],
      },
      {
        id: "pedal",
        type: DeviceType.StreamDeckPedal,
        isConnected: true,
        actions: [],
      },
    ]);

    expect(targets.map(({ device, profile }) => [device.id, profile])).toEqual([
      ["plus", "streamdeckcodex-plus"],
    ]);
  });

  it("does not persist activation until every target exposes actions", () => {
    const target = (id: string, actions: unknown[]) => ({
      device: {
        id,
        type: DeviceType.StreamDeckPlus,
        isConnected: true,
        actions,
      },
      profile: "streamdeckcodex-plus",
    });

    expect(bundledProfileTargetsVisible([])).toBe(false);
    expect(
      bundledProfileTargetsVisible([target("one", [{}]), target("two", [])]),
    ).toBe(false);
    expect(
      bundledProfileTargetsVisible([target("one", [{}]), target("two", [{}])]),
    ).toBe(true);
  });

  it("serializes profile switching and stores success only after visibility", () => {
    const source = readFileSync("src/plugin.ts", "utf8");
    const activation = source.slice(
      source.indexOf("const activateBundledProfileOnce"),
      source.indexOf("const refreshCoordinator"),
    );
    const switchIndex = activation.indexOf(
      "await streamDeck.profiles.switchToProfile",
    );
    const visibleIndex = activation.indexOf(
      "bundledProfileTargetsVisible(profiles)",
    );
    const settingsIndex = activation.indexOf(
      "await streamDeck.settings.setGlobalSettings",
    );

    expect(activation).not.toContain("Promise.all");
    expect(switchIndex).toBeGreaterThan(0);
    expect(visibleIndex).toBeGreaterThan(switchIndex);
    expect(settingsIndex).toBeGreaterThan(visibleIndex);
  });
});
