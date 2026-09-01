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
  bundledProfileForDevice,
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
  try {
    await codexStore.refreshLiveComposer();
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
    const healthSnapshot = await collectHealth(codexStore);
    healthTransitions.observe(healthSnapshot, (message) =>
      streamDeck.logger.info(message),
    );
  } catch (error) {
    streamDeck.logger.error("Failed to refresh Codex companion state", error);
  }
};

const healthTransitions = new HealthTransitionLogger();

const activateBundledProfileOnce = async (): Promise<void> => {
  const globalSettings = await streamDeck.settings.getGlobalSettings<{
    profileActivated?: boolean;
    profileActivationVersion?: string;
  }>();
  if (globalSettings.profileActivationVersion === BUNDLED_PROFILE_VERSION)
    return;

  const profiles = [...streamDeck.devices].flatMap((device) => {
    const profile = bundledProfileForDevice(device.type);
    return profile ? [{ device, profile }] : [];
  });
  if (profiles.length === 0) return;

  await Promise.all(
    profiles.map(({ device, profile }) =>
      streamDeck.profiles.switchToProfile(device.id, profile, 0),
    ),
  );
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
releaseSynthesizedKeysSync();
process.on("uncaughtExceptionMonitor", () => {
  releaseSynthesizedKeysSync();
});
process.once("exit", () => {
  refreshCoordinator.stop();
  releaseSynthesizedKeysSync();
  codexStore.close();
});

await streamDeck.connect();
try {
  await activateBundledProfileOnce();
} catch (error) {
  streamDeck.logger.error("Failed to activate bundled profile", error);
}
await refreshCoordinator.runNow();
