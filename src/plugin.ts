import streamDeck from "@elgato/streamdeck";
import { AgentNavigatorAction } from "./actions/agent-navigator.js";
import { AgentStatusAction } from "./actions/agent-status.js";
import { ApprovalModeAction } from "./actions/approval-mode.js";
import { CommandAction } from "./actions/command.js";
import { ContextAction } from "./actions/context.js";
import { KeycapAction } from "./actions/keycap.js";
import { HealthAction } from "./actions/health.js";
import { ModelAction } from "./actions/model.js";
import { ReasoningAction } from "./actions/reasoning.js";
import { UsageAction } from "./actions/usage.js";
import { WorkflowAction } from "./actions/workflow.js";
import { codexStore } from "./lib/codex-store.js";
import { releaseSynthesizedKeysSync } from "./lib/automation.js";
import { createRefreshCoordinator } from "./lib/refresh-coordinator.js";
import {
  BUNDLED_PROFILE_VERSION,
  bundledProfileTargets,
  bundledProfileTargetsVisible,
} from "./lib/bundled-profiles.js";
import { BUILD_INFO } from "./lib/build-info.js";
import { collectHealth, HealthTransitionLogger } from "./lib/health.js";

const agentStatus = new AgentStatusAction();
const agentNavigator = new AgentNavigatorAction();
const approvalMode = new ApprovalModeAction();
const command = new CommandAction();
const context = new ContextAction();
const keycap = new KeycapAction();
const health = new HealthAction();
const model = new ModelAction();
const workflow = new WorkflowAction();
const reasoning = new ReasoningAction();
const usage = new UsageAction();

streamDeck.logger.setLevel("info");
streamDeck.logger.info(
  `Starting Codex Companion ${BUILD_INFO.pluginVersion} ${BUILD_INFO.commit} (${BUILD_INFO.treeState})`,
);
streamDeck.actions.registerAction(agentStatus);
streamDeck.actions.registerAction(agentNavigator);
streamDeck.actions.registerAction(approvalMode);
streamDeck.actions.registerAction(command);
streamDeck.actions.registerAction(context);
streamDeck.actions.registerAction(keycap);
streamDeck.actions.registerAction(health);
streamDeck.actions.registerAction(model);
streamDeck.actions.registerAction(workflow);
streamDeck.actions.registerAction(reasoning);
streamDeck.actions.registerAction(usage);

export const refresh = async (): Promise<void> => {
  // The account-usage fetch spawns the app server at most once per window;
  // it runs off the critical path and keys render the last cached value.
  void codexStore.usageSnapshot();
  // One bounded composer observation per tick feeds every key that projects
  // live input; the store limits it to one native spawn per cache window and
  // keeps a structured reason when Codex is unreachable.
  await codexStore.refreshLiveComposer().catch(() => undefined);
  // Health summarizes what was observed and logs only transitions.
  // Rendering continues so every surface can show the same bounded reason.
  const healthSnapshot = collectHealth(codexStore);
  healthTransitions.observe(healthSnapshot, (message) =>
    streamDeck.logger.info(message),
  );
  await Promise.all([
    agentStatus.refreshAll(),
    agentNavigator.refreshAll(),
    approvalMode.refreshAll(),
    context.refreshAll(),
    health.refreshAll(),
    model.refreshAll(),
    reasoning.refreshAll(),
    usage.refreshAll(),
  ]);
};

const healthTransitions = new HealthTransitionLogger();

const activateBundledProfileOnce = async (): Promise<void> => {
  const globalSettings = await streamDeck.settings.getGlobalSettings<{
    profileActivated?: boolean;
    profileActivationVersion?: string;
  }>();
  if (globalSettings.profileActivationVersion === BUNDLED_PROFILE_VERSION)
    return;

  const profiles = bundledProfileTargets(streamDeck.devices);
  if (profiles.length === 0) return;

  // Stream Deck serializes bundled-profile imports. Concurrent requests race
  // and are rejected as "another operation is already in progress".
  for (const { device, profile } of profiles) {
    await streamDeck.profiles.switchToProfile(device.id, profile, 0);
  }

  const deadline = Date.now() + 3_000;
  while (!bundledProfileTargetsVisible(profiles) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (!bundledProfileTargetsVisible(profiles)) {
    throw new Error(
      "Bundled profile activation did not expose actions; it remains pending.",
    );
  }
  await streamDeck.settings.setGlobalSettings({
    ...globalSettings,
    profileActivated: true,
    profileActivationVersion: BUNDLED_PROFILE_VERSION,
  });
  streamDeck.logger.info(
    `Activated ${profiles.length} bundled Codex Companion profile(s)`,
  );
};

const refreshCoordinator = createRefreshCoordinator(refresh, 1250, (error) =>
  streamDeck.logger.error("Failed to refresh Codex companion state", error),
);
refreshCoordinator.start();
process.on("uncaughtExceptionMonitor", () => {
  releaseSynthesizedKeysSync();
});
process.once("exit", () => {
  refreshCoordinator.stop();
  releaseSynthesizedKeysSync();
  codexStore.close();
});

await streamDeck.connect();
// Connect and register actions before attempting the defensive PTT cleanup.
// macOS may block an untrusted AppleScript on its Accessibility prompt; the
// cleanup is bounded and must never put Stream Deck into a plugin restart loop.
releaseSynthesizedKeysSync();
try {
  await activateBundledProfileOnce();
} catch (error) {
  streamDeck.logger.error("Failed to activate bundled profile", error);
}
await refreshCoordinator.runNow();
