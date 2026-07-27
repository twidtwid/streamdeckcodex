import { resolve } from "node:path";

export function nativeHelperPath(root) {
  return resolve(
    root,
    "com.todd.streamdeckcodex.sdPlugin",
    "bin",
    "codex-ui-control",
  );
}
