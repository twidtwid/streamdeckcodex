import type { WorkflowDefinition } from "./workflows.js";
import { WORKFLOWS } from "./workflows.js";

const workflow = (
  id: string,
  label: string,
  icon: string,
  prompt: string,
  accent = "#79C0FF",
): WorkflowDefinition => ({ id, label, icon, prompt, accent });

export const KEYCAP_WORKFLOWS: readonly WorkflowDefinition[] = [
  ...WORKFLOWS.filter(({ id }) => id === "pr-review" || id === "debug"),
  workflow(
    "yolo",
    "YOLO",
    "yolo",
    "Take ownership of the current project goal and work autonomously until it is genuinely complete. Preserve user data, respect existing repository instructions, verify the result, and stop only for a decision that truly requires the user.",
    "#FFD166",
  ),
  workflow(
    "publish",
    "YEET",
    "yeet",
    "Prepare the current project for publication. Review the working tree, run the appropriate checks, make an intentional commit, push the current branch, and open or update a draft pull request. Do not publish broken or unrelated changes.",
    "#9CD5FE",
  ),
  workflow(
    "branch",
    "Branch info",
    "branch",
    "Inspect the current Git branch and repository state. Explain the branch's purpose, divergence, and the safest next branch operation.",
  ),
  workflow(
    "new-branch",
    "New branch",
    "branch-add",
    "Create a well-named new Git branch for the current task after checking the working tree and repository conventions. Preserve all existing changes.",
  ),
  workflow(
    "merge",
    "Merge",
    "merge",
    "Prepare and perform the appropriate Git merge for the current task. Identify the intended source and destination from repository context, stop if ambiguous, resolve conflicts carefully, and verify the result.",
  ),
  workflow(
    "diff",
    "Diff",
    "diff",
    "Review the current Git diff. Summarize the intent, identify correctness or regression risks, and recommend the next concrete action.",
  ),
  workflow(
    "commit",
    "Commit",
    "commit",
    "Review the current working tree, run proportional checks, stage only the intended changes, and create a clear conventional commit without including unrelated work.",
  ),
  workflow(
    "push",
    "Push",
    "push",
    "Verify the current branch and checks, then push it to its configured remote without force-pushing. Report the exact branch and remote.",
  ),
  workflow(
    "release",
    "Ship prep",
    "release",
    "Audit the current project for release readiness, fix bounded blockers, run the full release checks, and prepare the release artifacts and notes. Do not publish until the result is verified.",
    "#7EE787",
  ),
  workflow(
    "deploy",
    "Deploy",
    "deploy",
    "Determine the project's documented deployment workflow, verify the exact code and configuration that would ship, run preflight checks, and deploy only when the existing project instructions authorize it.",
    "#9CD5FE",
  ),
  workflow(
    "refactor",
    "Refactor",
    "refactor",
    "Find the highest-value bounded refactor in the current project. Preserve behavior, improve clarity and maintainability, and verify the change with focused tests.",
    "#C8A4FF",
  ),
  workflow(
    "tests",
    "Add tests",
    "tests",
    "Find the most important untested behavior in the current project, add focused tests that catch realistic regressions, and run them.",
    "#FFD166",
  ),
  workflow(
    "search",
    "Search",
    "search",
    "Search the current project for the code, configuration, or behavior most relevant to the active task. Return precise locations and explain the relationships you found.",
  ),
  workflow(
    "explain",
    "Explain",
    "explain",
    "Explain the most relevant current project behavior clearly and concretely, using precise file references and a compact flow of how the parts interact.",
    "#C8A4FF",
  ),
  workflow(
    "document",
    "Document",
    "document",
    "Identify the most important missing or stale documentation for the current work, update it accurately, and verify that commands and examples match the implementation.",
  ),
  workflow(
    "optimize",
    "Optimize",
    "optimize",
    "Profile or otherwise gather evidence for the most important performance problem in the current project, implement a bounded optimization, and verify the improvement without changing behavior.",
    "#7EE787",
  ),
  workflow(
    "audit",
    "Audit",
    "audit",
    "Audit the current project for correctness, security, reliability, and maintainability risks. Prioritize concrete findings with precise file references and actionable fixes.",
    "#FFD166",
  ),
  workflow(
    "fix-ci",
    "Fix CI",
    "fix",
    "Inspect the current branch's failing CI checks and logs, reproduce the failure locally when practical, implement the smallest robust correction, and rerun the affected checks. If CI is already green, report that without inventing work.",
    "#FF7B72",
  ),
  workflow(
    "explore",
    "Explore",
    "brain-medium",
    "Pause implementation and explore the current problem from first principles. Surface hidden assumptions, compare realistic options and tradeoffs, and recommend one concrete path.",
    "#C8A4FF",
  ),
  workflow(
    "analyze",
    "Analyze",
    "brain-outline",
    "Perform a deep technical analysis of the current problem. Trace dependencies and failure modes, test the strongest competing explanations, and produce an evidence-backed conclusion.",
    "#C8A4FF",
  ),
  workflow(
    "summarize",
    "Summarize",
    "summarize",
    "Summarize the current project's active work, important decisions, unresolved risks, and next concrete actions in a compact handoff.",
  ),
  workflow(
    "goal",
    "Define goal",
    "goal",
    "Turn the current request into a concrete goal with explicit scope, constraints, and measurable success criteria. Present the definition without starting implementation.",
    "#FFD166",
  ),
  workflow(
    "terminal",
    "Run shell",
    "terminal",
    "Use the terminal in the current project to investigate and complete the active task. Prefer precise, non-destructive commands and verify actual output.",
  ),
  workflow(
    "editor",
    "Edit code",
    "edit",
    "Inspect the current project and make the code edit most directly required by the active task. Preserve unrelated work and verify the change.",
  ),
  workflow(
    "sessions",
    "Chat audit",
    "sessions",
    "Review the recent Codex sessions relevant to this project, summarize their state and relationship, and identify the session that should be continued.",
    "#C8A4FF",
  ),
] as const;

export function keycapWorkflow(id: string): WorkflowDefinition | undefined {
  return KEYCAP_WORKFLOWS.find((candidate) => candidate.id === id);
}
