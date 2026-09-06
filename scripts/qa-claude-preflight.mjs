import { spawnSync } from "node:child_process";
import { nativeHelperPath } from "./lib/native-helper-path.mjs";
import { resolve } from "node:path";

// Read-only, bounded and public-safe: do not print session IDs, titles or paths.
const result = spawnSync(nativeHelperPath(resolve(".")), ["provider-read"], {
  encoding: "utf8",
  timeout: 10000,
  maxBuffer: 256 * 1024,
});
let state;
try {
  state = JSON.parse(result.stdout || "{}").providerState;
} catch {
  /* reported below */
}
const ready =
  result.status === 0 && state?.foreground === "claude" && !!state.target;
console.log(
  JSON.stringify(
    {
      foreground: state?.foreground ?? "other-or-locked",
      exactCodeTarget: !!state?.target,
      environment: state?.target?.environment ?? "unavailable",
      modelExposed: !!state?.model,
      effortExposed: !!state?.effort,
      permissionsExposed: !!state?.permission,
      capabilities: state?.capabilities ?? [],
      reason: state?.reason ?? (ready ? "observed" : "unavailable"),
    },
    null,
    2,
  ),
);
process.exitCode = ready ? 0 : 1;
