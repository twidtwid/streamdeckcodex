import { DeviceType } from "@elgato/streamdeck";

const PROFILE_BY_DEVICE_TYPE: Readonly<Partial<Record<DeviceType, string>>> = {
  [DeviceType.StreamDeck]: "streamdeckcodex-stream-deck",
  [DeviceType.StreamDeckMini]: "streamdeckcodex-mini",
  [DeviceType.StreamDeckXL]: "streamdeckcodex-xl",
  [DeviceType.StreamDeckPlus]: "streamdeckcodex-plus",
  [DeviceType.StreamDeckNeo]: "streamdeckcodex-neo",
};

export const BUNDLED_PROFILE_VERSION = "profiles-v2";

export function bundledProfileForDevice(
  deviceType: DeviceType,
): string | undefined {
  return PROFILE_BY_DEVICE_TYPE[deviceType];
}
