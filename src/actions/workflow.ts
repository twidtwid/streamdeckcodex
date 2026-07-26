import {
  action,
  type Action,
  type DialRotateEvent,
  type DialUpEvent,
  type KeyDownEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { launchWorkflow, openSkills } from "../lib/automation.js";
import { codexStore } from "../lib/codex-store.js";
import { commandKeySvg, svgDataUrl } from "../lib/visuals.js";
import {
  workflowAt,
  WORKFLOWS,
  type WorkflowDefinition,
} from "../lib/workflows.js";

type WorkflowSettings = {
  workflowId?: string;
  workflowIndex?: number;
  path?: string;
};

function configuredWorkflow(settings: WorkflowSettings): WorkflowDefinition {
  if (settings.workflowId) {
    const match = WORKFLOWS.find(
      (candidate) => candidate.id === settings.workflowId,
    );
    if (match) return match;
  }
  return workflowAt(Number(settings.workflowIndex ?? 0));
}

@action({ UUID: "com.todd.streamdeckcodex.workflow" })
export class WorkflowAction extends SingletonAction<WorkflowSettings> {
  readonly #selection = new Map<string, number>();

  async onWillAppear(event: WillAppearEvent<WorkflowSettings>): Promise<void> {
    const configured = configuredWorkflow(event.payload.settings);
    const index = Math.max(0, WORKFLOWS.indexOf(configured));
    this.#selection.set(event.action.id, index);
    await this.draw(event.action, configured);
  }

  async onDialRotate(event: DialRotateEvent<WorkflowSettings>): Promise<void> {
    const current = this.#selection.get(event.action.id) ?? 0;
    const index =
      (((current + Math.sign(event.payload.ticks)) % WORKFLOWS.length) +
        WORKFLOWS.length) %
      WORKFLOWS.length;
    this.#selection.set(event.action.id, index);
    await event.action.setSettings({
      ...event.payload.settings,
      workflowIndex: index,
    });
    await this.draw(event.action, workflowAt(index));
  }

  async onDialUp(event: DialUpEvent<WorkflowSettings>): Promise<void> {
    await this.launch(
      event.action,
      workflowAt(this.#selection.get(event.action.id) ?? 0),
      event.payload.settings,
    );
  }

  async onTouchTap(event: TouchTapEvent<WorkflowSettings>): Promise<void> {
    if (event.payload.hold) {
      try {
        await openSkills();
      } catch {
        await event.action.showAlert();
      }
      return;
    }
    await this.launch(
      event.action,
      workflowAt(this.#selection.get(event.action.id) ?? 0),
      event.payload.settings,
    );
  }

  async onKeyDown(event: KeyDownEvent<WorkflowSettings>): Promise<void> {
    await this.launch(
      event.action,
      configuredWorkflow(event.payload.settings),
      event.payload.settings,
    );
  }

  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.actions]
        .filter((visible) => visible.isDial())
        .map((visible) =>
          this.draw(visible, workflowAt(this.#selection.get(visible.id) ?? 0)),
        ),
    );
  }

  private async launch(
    actionInstance: Action<WorkflowSettings>,
    workflow: WorkflowDefinition,
    settings: WorkflowSettings,
  ): Promise<void> {
    try {
      await launchWorkflow(
        workflow,
        settings.path || codexStore.controlThread()?.cwd,
      );
      if (actionInstance.isKey()) await actionInstance.showOk();
    } catch {
      await actionInstance.showAlert();
    }
  }

  private async draw(
    actionInstance: Action<WorkflowSettings>,
    workflow: WorkflowDefinition,
  ): Promise<void> {
    if (actionInstance.isDial()) {
      const index = Math.max(0, WORKFLOWS.indexOf(workflow));
      await actionInstance.setFeedback({
        title: "Skill",
        value: workflow.label,
        indicator: {
          value: ((index + 1) / WORKFLOWS.length) * 100,
          bar_fill_c: "#A371F7",
        },
      });
    } else if (actionInstance.isKey()) {
      await actionInstance.setImage(
        svgDataUrl(
          commandKeySvg(workflow.label, workflow.accent, workflow.icon),
        ),
      );
      await actionInstance.setTitle("");
    }
  }
}
