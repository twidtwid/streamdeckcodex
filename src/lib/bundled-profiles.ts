import { DeviceType } from "@elgato/streamdeck";

const PROFILE_BY_DEVICE_TYPE: Readonly<Partial<Record<DeviceType, string>>> = {
  [DeviceType.StreamDeck]: "streamdeckcodex-stream-deck",
  [DeviceType.StreamDeckMini]: "streamdeckcodex-mini",
  [DeviceType.StreamDeckXL]: "streamdeckcodex-xl",
  [DeviceType.StreamDeckPlus]: "streamdeckcodex-plus",
  [DeviceType.StreamDeckNeo]: "streamdeckcodex-neo",
};

export const BUNDLED_PROFILE_VERSION = "profiles-v3";

export type BundledProfileTarget = Readonly<{
  device: Readonly<{
    id: string;
    type: DeviceType;
    isConnected: boolean;
    actions: Iterable<unknown>;
  }>;
  profile: string;
}>;

export function bundledProfileForDevice(
  deviceType: DeviceType,
): string | undefined {
  return PROFILE_BY_DEVICE_TYPE[deviceType];
}

export function bundledProfileTargets(
  devices: Iterable<BundledProfileTarget["device"]>,
): BundledProfileTarget[] {
  return [...devices].flatMap((device) => {
    if (!device.isConnected) return [];
    const profile = bundledProfileForDevice(device.type);
    return profile ? [{ device, profile }] : [];
  });
}

export function bundledProfileTargetsVisible(
  targets: readonly BundledProfileTarget[],
): boolean {
  return (
    targets.length > 0 &&
    targets.every(({ device }) => [...device.actions].length > 0)
  );
}
