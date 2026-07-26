import streamDeck, { DeviceType } from "@elgato/streamdeck";
import { AgentNavigatorAction } from "./actions/agent-navigator.js";
import { AgentStatusAction } from "./actions/agent-status.js";
import { CommandAction } from "./actions/command.js";
import { ContextAction } from "./actions/context.js";
import { KeycapAction } from "./actions/keycap.js";
import { ModelAction } from "./actions/model.js";
import { ReasoningAction } from "./actions/reasoning.js";
import { SessionNavigationAction } from "./actions/session-navigation.js";
import { UsageAction } from "./actions/usage.js";
import { WorkflowAction } from "./actions/workflow.js";
import { codexStore } from "./lib/codex-store.js";
import { releaseSynthesizedKeysSync } from "./lib/automation.js";

const agentStatus = new AgentStatusAction();
const agentNavigator = new AgentNavigatorAction();
const command = new CommandAction();
const context = new ContextAction();
const keycap = new KeycapAction();
const model = new ModelAction();
const workflow = new WorkflowAction();
const reasoning = new ReasoningAction();
const sessionNavigation = new SessionNavigationAction();
const usage = new UsageAction();

streamDeck.logger.setLevel("debug");
streamDeck.actions.registerAction(agentStatus);
streamDeck.actions.registerAction(agentNavigator);
streamDeck.actions.registerAction(command);
streamDeck.actions.registerAction(context);
streamDeck.actions.registerAction(keycap);
streamDeck.actions.registerAction(model);
streamDeck.actions.registerAction(workflow);
streamDeck.actions.registerAction(reasoning);
streamDeck.actions.registerAction(sessionNavigation);
streamDeck.actions.registerAction(usage);

const refresh = async (): Promise<void> => {
  try {
    await codexStore.refreshLiveInput();
    await Promise.all([
      agentStatus.refreshAll(),
      agentNavigator.refreshAll(),
      command.refreshAll(),
      context.refreshAll(),
      keycap.refreshAll(),
      model.refreshAll(),
      workflow.refreshAll(),
      reasoning.refreshAll(),
      sessionNavigation.refreshAll(),
      usage.refreshAll(),
    ]);
  } catch (error) {
    streamDeck.logger.error("Failed to refresh Codex companion state", error);
  }
};

const activateBundledProfileOnce = async (): Promise<void> => {
  const globalSettings = await streamDeck.settings.getGlobalSettings<{
    profileActivated?: boolean;
    profileActivationVersion?: string;
  }>();
  if (globalSettings.profileActivationVersion === "profile-v1") return;
  const plus = [...streamDeck.devices].find(
    (device) => device.type === DeviceType.StreamDeckPlus,
  );
  if (!plus) {
    streamDeck.logger.warn(
      "No connected Stream Deck Plus found for profile activation",
    );
    return;
  }
  await streamDeck.profiles.switchToProfile(plus.id, "streamdeckcodex-plus", 0);
  await streamDeck.settings.setGlobalSettings({
    ...globalSettings,
    profileActivated: true,
    profileActivationVersion: "profile-v1",
  });
  streamDeck.logger.info("Activated bundled Codex Companion Plus profile");
};

setInterval(() => void refresh(), 1250).unref();
releaseSynthesizedKeysSync();
process.once("exit", () => {
  releaseSynthesizedKeysSync();
  codexStore.close();
});

await streamDeck.connect();
try {
  await activateBundledProfileOnce();
} catch (error) {
  streamDeck.logger.error("Failed to activate bundled Plus profile", error);
}
await refresh();
