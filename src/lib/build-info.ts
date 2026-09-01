export type BuildInfo = Readonly<{
  schemaVersion: 1;
  pluginVersion: string;
  commit: string;
  treeState: "clean" | "dirty";
}>;

declare const __STREAMDECK_CODEX_BUILD__: BuildInfo | undefined;

export const BUILD_INFO: BuildInfo =
  typeof __STREAMDECK_CODEX_BUILD__ === "undefined"
    ? {
        schemaVersion: 1,
        pluginVersion: "development",
        commit: "development",
        treeState: "dirty",
      }
    : __STREAMDECK_CODEX_BUILD__;
