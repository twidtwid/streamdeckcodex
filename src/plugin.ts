import {
  ProviderAction,
  observeProviders,
  serializeProviders,
} from "./lib/providers/router.js";
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
import { BUILD_INFO } from "./lib/build-info.js";
import { collectHealth, HealthTransitionLogger } from "./lib/health.js";

const agentStatus = new ProviderAction(new AgentStatusAction());
const agentNavigator = new ProviderAction(new AgentNavigatorAction());
const approvalMode = new ProviderAction(new ApprovalModeAction());
const command = new ProviderAction(new CommandAction());
const context = new ProviderAction(new ContextAction());
const keycap = new ProviderAction(new KeycapAction());
const health = new ProviderAction(new HealthAction());
const model = new ProviderAction(new ModelAction());
const workflow = new ProviderAction(new WorkflowAction());
const reasoning = new ProviderAction(new ReasoningAction());
const usage = new ProviderAction(new UsageAction());

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

export const refresh = async (): Promise<void> =>
  serializeProviders(async () => {
    await observeProviders();
    // The account-usage fetch spawns the app server at most once per window;
    // it runs off the critical path and keys render the last cached value.
    void codexStore.usageSnapshot();
    // One bounded composer observation per tick feeds every key that projects
    // live input; the store limits it to one native spawn per cache window and
    // keeps a structured reason when Codex is unreachable.
    await codexStore.refreshLiveComposer().catch((error) => {
      const signature =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      if (signature !== lastComposerFailure) {
        lastComposerFailure = signature;
        streamDeck.logger.warn(`Live composer refresh failed: ${signature}`);
      }
    });
    // Health summarizes what was observed and logs only transitions.
    // Rendering continues so every surface can show the same bounded reason.
    const healthSnapshot = collectHealth(codexStore);
    if (healthSnapshot.components.focus.state === "ready") {
      lastComposerFailure = undefined;
    }
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
      command.refreshAll(),
      keycap.refreshAll(),
      workflow.refreshAll(),
    ]);
  });

const healthTransitions = new HealthTransitionLogger();
let lastComposerFailure: string | undefined;

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
// Bundled profiles are opt-in. Never replace or switch a hand-built profile.
await refreshCoordinator.runNow();
