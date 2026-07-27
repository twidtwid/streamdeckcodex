# Plan 002: Bind every task mutation to the exact focused Codex window

> **Executor instructions**: Follow this plan step by step and run every
> verification. Preserve the user's pre-existing dirty working tree. Do not
> change product labels or visual design. If exact task/window identity cannot
> be proved, fail closed and show an alert.
>
> **Drift check (run first)**:
> `git diff --stat aacdbf2..HEAD -- src native test scripts`
> and `git status --short`.
> Compare the live code with the excerpts below. Do not reset, restore, stash,
> or discard pre-existing changes.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: bug, security
- **Planned at**: commit `aacdbf2`, 2026-07-26

## Why this matters

Hardware mutations currently use two unsafe identity paths. TypeScript can fall
back from focused task to selected/newest task, and the native helper can open a
deep link but then select the first matching composer in the entire Codex
application. A successful state change in the wrong window is still wrong.
After this plan, every task-scoped key either proves and controls the exact
focused task/window or dispatches nothing.

## Current state

`src/lib/codex-store.ts:333-340`:

```ts
controlThread(): AgentSnapshot | undefined {
  const threads = this.recentThreads(12);
  const focusedThreadId = this.#focusedThreadId(Date.now());
  return (
    threads.find((thread) => thread.id === focusedThreadId) ??
    threads.find((thread) => thread.id === this.#selectedThreadId) ??
    threads[0]
  );
}
```

Mutation call sites include:

- `src/actions/command.ts:149-155` — PTT and commands use
  `codexStore.controlThread()?.id`.
- `src/actions/keycap.ts:55-62` — Accept, Reject, Send, and Sidebar use the same
  fallback.
- `src/actions/workflow.ts:103-112` — workflows use an explicit path or
  `controlThread()?.cwd`.
- `src/actions/model.ts:134-140` and `src/actions/reasoning.ts:137-144` check a
  snapshot task but call model/reasoning apply without its ID.
- `src/lib/codex-ui-control.ts:141-177` accepts a thread ID for modes and
  approval, but `applyLiveModel`/`applyLiveReasoning` at lines 186-193 do not.

`native/CodexUIControl.swift:354-368` opens a deep link and sleeps for fixed
intervals. `composerCandidate` at lines 446-459 searches `allElements` of the
whole application and returns the first eligible text area. Picker and approval
searches likewise traverse the application root.

Follow the existing fail-closed pattern in `src/actions/keycap.ts:50-54`, where
workflow keycaps require `codexStore.focusedThread()` and alert when absent.

Reconciliation note from the first executor: Codex AX windows expose only the
generic title `ChatGPT`, with no conversation UUID. Exact targeting must
therefore use the repository's existing desktop activity signal as a fresh
focus witness. Actual
`thread_stream_view_activity_changed` events include `conversationId`,
`rendererWindowId`, `rendererWindowAppearance=primary`, and
`rendererWindowFocused=true`; `src/lib/desktop-active.ts` currently discards
the window ID and event position/time. Preserve those fields in the witness.
The witness is valid only when it was observed after the navigation request,
Codex is frontmost, exactly one Codex AX window is focused, and the witness
still matches after the operation.

## Commands you will need

| Purpose       | Command                             | Expected on success         |
| ------------- | ----------------------------------- | --------------------------- |
| Typecheck     | `npm run typecheck`                 | exit 0                      |
| Target tests  | `npm test -- focused-target`        | all exact-target cases pass |
| All key tests | `npm test -- profile-keys.behavior` | 48/48 pass                  |
| Native build  | `npm run native:build`              | Swift helper exits 0        |
| Full gate     | `npm run check`                     | exit 0                      |

## Scope

**In scope**:

- `src/lib/codex-store.ts`
- `src/lib/desktop-active.ts`
- `src/actions/command.ts`
- `src/actions/keycap.ts`
- `src/actions/workflow.ts`
- `src/actions/model.ts`
- `src/actions/reasoning.ts`
- `src/lib/automation.ts`
- `src/lib/codex-ui-control.ts`
- `native/CodexUIControl.swift`
- `com.todd.streamdeckcodex.sdPlugin/scripts/ptt-guard.mjs`
- focused-target and 48-key tests created by Plan 001
- `test/active-desktop-thread.test.ts`
- a new native test seam/fixture under `native/Tests/` or `test/fixtures/ax/`
- `scripts/build-native.mjs` only if needed to build native tests

**Out of scope**:

- Page layout, labels, icons, prompts, or colors.
- Changing which recent tasks are displayed or navigable.
- Private Codex renderer APIs or event buses.
- Blindly increasing sleeps as a substitute for identity verification.
- Installing or changing the live profile.

## Git workflow

- Branch: `codex/002-exact-focused-window-targeting`
- Commit message example: `Bind controls to the focused Codex task`
- Do not push or open a PR without explicit instruction.

## Steps

### Step 1: Separate display/navigation selection from mutation identity

Keep `controlThread()` only where selected/newest fallback is appropriate for
display or navigation. Introduce a clearly named mutation resolver, or use
`focusedThread()` directly, for every mutation. It must return no target when
desktop focus identity is unavailable.

Update Command, Keycap command actions, Workflow, PTT, Model, and Reasoning
callers. Explicit configured workflow paths may remain valid only when the
setting itself is the intentional target; never silently substitute a recent
cwd.

**Verify**:
`rg -n "controlThread\\(\\)" src/actions src/lib/automation.ts` → no
task-mutating call site uses fallback identity.

### Step 2: Carry the exact task ID through every native operation

Add `threadId` parameters through:

- `applyModel` → `applyLiveModel` → `invoke("model", ...)`;
- `applyReasoning` → `applyLiveReasoning` →
  `invoke("reasoning", ...)`;
- all shortcut/slash operations that target a composer;
- PTT start, Compact, Accept, Reject, Send, Sidebar where applicable.

At TypeScript boundaries, require the ID rather than making it optional for a
task-scoped mutation. Keep read-only/global operations explicitly separate.

**Verify**: focused tests inspect exact native argument vectors for Plan, FAST,
Permissions, PTT, Compact, Accept, Reject, Send, Model, and Reasoning.

### Step 3: Verify navigation with a fresh focused-window witness

Refactor the native helper to:

1. request `codex://threads/<id>`;
2. record the desktop-log cursor before navigation, then poll for a **new**
   primary-window activity event whose conversation ID equals the request and
   whose renderer window is focused;
3. require Codex to be the frontmost application and exactly one Codex AX
   window to report focused;
4. retain that focused AX window as the only traversal root;
5. immediately before and after mutation, require the frontmost/focused AX
   invariant and the latest activity witness to still identify the requested
   task and renderer window;
6. abort on timeout, stale/cached event, background app, ambiguity, multiple
   focused windows/composers, changed renderer window, or identity mismatch.

Do not search the entire application root after targeting. Extract AX querying
behind testable functions accepting a root element or a neutral element-tree
fixture.

Do not claim that activation plus timing proves identity. A valid proof requires
both sides of the bridge: a new exact task/window focus event and the unique
frontmost AX-focused window. If a reproducible fixture shows those signals can
diverge while all checks still pass, STOP.

**Verify**: native fixture tests cover requested window, previous window still
present, two windows, delayed navigation, ambiguous composers, and timeout.

### Step 4: Enforce fail-closed behavior across all 48 keys

Use Plan 001's matrix. For every task-scoped key, add or retain a negative case
where focused identity is unavailable. Assert no URL, shortcut, slash command,
native picker operation, prompt, or PTT event is dispatched; `showAlert()` is
recorded and `showOk()` is absent.

Display-only Usage and Context may render unknown data without mutating Codex.
New Chat and Skills are documented global navigation actions and do not require
a current task.

**Verify**: `npm test -- profile-keys.behavior focused-target` → 48/48 pass and
all task-scoped negative cases dispatch zero mutations.

### Step 5: Run the full deterministic gate

Run typecheck, all tests, native build, visual/design QA, build, and manifest
validation.

**Verify**: `npm run check` → exit 0.

## Test plan

- TypeScript argument tests for every task-scoped key.
- Native AX fixture tests proving traversal is confined to the verified focused
  window.
- Multi-window regression: target B while A remains open; only B may change.
- Delayed-deep-link regression: no operation before identity appears.
- Missing/ambiguous identity regression: no mutation and visible failure.
- Model and Reasoning explicitly include the same thread ID used to build their
  snapshots.

## Done criteria

- [ ] No mutation uses selected/newest fallback.
- [ ] Model and Reasoning carry exact task IDs into the native helper.
- [ ] Native traversal is rooted at the verified target window.
- [ ] Fixed sleeps are not treated as identity proof.
- [ ] Multi-window and ambiguity tests pass.
- [ ] All 48 key behavior tests pass.
- [ ] `npm run native:build` and `npm run check` exit 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status updated.

## STOP conditions

- Codex stops emitting a fresh primary-window activity event containing the
  requested conversation ID and renderer window ID after deep-link navigation.
- A reproducible fixture shows the fresh task/window witness and the unique
  frontmost AX-focused window can diverge while all planned checks pass.
- Correct targeting would require a private renderer API or copying proprietary
  application code/assets.
- A task-scoped action has no well-defined focused-task policy in the 48-key
  contract.
- Native testability requires a wholesale helper rewrite rather than a bounded
  query seam.

## Maintenance notes

Any future task mutation must accept a required verified identity at its public
boundary. Reviewers should reject “open then sleep” logic and application-root
first-match AX searches. Navigation/display fallback may remain, but it must be
named and separated so mutation code cannot call it accidentally.
