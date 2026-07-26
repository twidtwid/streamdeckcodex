export interface WorkflowDefinition {
  id: string;
  label: string;
  prompt: string;
  accent: string;
  icon: string;
}

export const WORKFLOWS: readonly WorkflowDefinition[] = [
  {
    id: "pr-review",
    label: "PR review",
    accent: "#A371F7",
    icon: "review",
    prompt:
      "Review the current pull request or branch changes. Prioritize correctness, regressions, security, and missing tests. Report findings by severity with precise file references.",
  },
  {
    id: "debug",
    label: "Debug",
    accent: "#F4B740",
    icon: "debug",
    prompt:
      "Diagnose the current issue in this project. Reproduce it when practical, identify the root cause with evidence, implement the smallest robust fix, and verify it.",
  },
  {
    id: "refactor",
    label: "Refactor",
    accent: "#35C759",
    icon: "refactor",
    prompt:
      "Inspect the current project for the highest-value bounded refactor. Preserve behavior, improve clarity and maintainability, and verify the change with focused tests.",
  },
  {
    id: "tests",
    label: "Add tests",
    accent: "#2F81F7",
    icon: "tests",
    prompt:
      "Find the most important untested behavior in the current project, add focused tests that would catch realistic regressions, and run them.",
  },
] as const;

export function workflowAt(index: number): WorkflowDefinition {
  const wrapped =
    ((index % WORKFLOWS.length) + WORKFLOWS.length) % WORKFLOWS.length;
  return WORKFLOWS[wrapped] ?? WORKFLOWS[0]!;
}
