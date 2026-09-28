import type { Action } from "@elgato/streamdeck";

type JsonObject = {
  [key: string]: JsonValue;
};
type JsonValue =
  boolean | number | string | null | undefined | JsonObject | JsonValue[];

/**
 * SDK v3 keeps `showAlert` on keys and dials only; Neo Infobar actions omit it.
 */
export async function showActionAlert<T extends JsonObject>(
  action: Action<T>,
): Promise<void> {
  if (action.isKey() || action.isDial()) await action.showAlert();
}
