# Plan 003: Report success only after truthful live-state postconditions

> **Executor instructions**: Implement verified outcomes, not optimistic
> indicators. A process exit, deep-link dispatch, keystroke, or cached setting
> is not proof. Preserve all existing user changes and every draft. Run the
> 48-key suite after each step.
>
> **Drift check (run first)**:
> `git diff --stat aacdbf2..HEAD -- src native test scripts`
> and `git status --short`.
> The working tree was already dirty when planned. Never reset, restore, stash,
> or discard it. Stop if current behavior no longer matches the excerpts.

## Status

- **State**: DONE — accepted at `4e756f8` after two adversarial review rounds
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/001-executable-48-key-contract.md`,
  `plans/002-exact-focused-window-targeting.md`
- **Category**: bug, security
- **Planned at**: commit `aacdbf2`, 2026-07-26

## Why this matters

The Permissions key can display cached ASK while Codex is actually YOLO, FAST
can accept an unproved transition, and YEET/New Project can show success when
only a launcher process exited. Those are not cosmetic defects: the control
surface is making claims about permissions and mutations. After this plan,
every success indicator comes from a visible postcondition in the exact target
window, and unknown state is visibly unknown.

## Current state

`src/actions/approval-mode.ts:34-35`:

```ts
async onWillAppear(event: WillAppearEvent<ApprovalSettings>): Promise<void> {
  await this.draw(event.action, event.payload.settings.mode ?? "yolo");
}
```

`src/actions/approval-mode.ts:56-63` periodically redraws the same saved setting
without reading live Codex state.

`native/CodexUIControl.swift:837-853`:

```swift
let previousState = try? readFastMode(appElement)
// ...
if let previousState, active == previousState {
    return nil
}
return active
```

If the pre-read fails, any readable post-state is accepted even if no transition
was proved.

`src/lib/automation.ts:30-49` resolves success when a child process exits zero.
`openNewProject` at lines 170-172 only invokes the `new-project` shortcut.
`src/actions/keycap.ts:68` then calls `showOk()`.

Match existing visible failure vocabulary in
`src/lib/codex-ui-control.ts:196-206`, but extend it with stable reason codes
rather than leaking task content, prompts, or local paths.

Reconciliation note from the first executor and independent evidence review:
workflow deep links do not return a task ID, and neither AX nor SQLite alone
proves the complete outcome. Use the exact cross-signal bridge already accepted
in Plan 002, extended for a newly created task:

1. snapshot the bounded desktop-log cursor and current thread IDs before opening
   the deep link;
2. accept exactly one new primary/focused activity witness after that cursor,
   require its task ID not to exist in the snapshot, and retain its renderer
   window ID and log provenance;
3. require Codex frontmost with exactly one focused AX window and exactly one
   composer in that retained window;
4. read the SQLite row keyed by the witnessed task ID, require it to be newly
   created after the snapshot, and compare `realpath`-canonicalized cwd values;
5. read the exact AX composer value in the retained focused window without
   changing or submitting it; and
6. revalidate the same log witness, AX element identity, database row identity,
   cwd, and draft before reporting success.

The log is identity evidence, not the outcome by itself; the task-keyed database
cwd plus the visible AX draft are the outcome. Reject zero/multiple new rows,
zero/multiple fresh witnesses, a pre-existing task, renderer history changes,
window replacement, missing database identity, symlink/canonicalization
mismatch, composer ambiguity, draft mismatch, or timeout. This is the same
fresh-witness + unique-frontmost-window invariant Plan 002 uses for existing
task mutations; do not weaken it to timing-only correlation. If an adversarial
fixture can make these accepted signals refer to different live tasks while all
checks pass, STOP.

## Commands you will need

| Purpose        | Command                                | Expected on success               |
| -------------- | -------------------------------------- | --------------------------------- |
| Typecheck      | `npm run typecheck`                    | exit 0                            |
| Approval tests | `npm test -- approval-mode`            | all live/unknown/cycle cases pass |
| Mode tests     | `npm test -- plan-mode physical-input` | Plan and FAST prove transitions   |
| Key contract   | `npm test -- profile-keys.behavior`    | 48/48 pass                        |
| Native build   | `npm run native:build`                 | exit 0                            |
| Full gate      | `npm run check`                        | exit 0                            |

## Scope

**In scope**:

- `src/actions/approval-mode.ts`
- `src/actions/command.ts`
- `src/actions/keycap.ts`
- `src/actions/workflow.ts`
- `src/lib/automation.ts`
- `src/lib/codex-store.ts`
- `src/lib/desktop-active.ts`
- `src/lib/codex-ui-control.ts`
- `src/lib/visuals.ts` only for explicit UNKNOWN/failure visuals
- `native/CodexUIControl.swift`
- relevant tests from Plan 001
- new native fixtures/tests for postconditions

**Out of scope**:

- Redesigning icons, labels, page layout, or workflow prompt copy.
- Changing the approval cycle order: ASK → APPROVE → YOLO → CUSTOM.
- Typing over or clearing a user's draft.
- Treating log output, cached settings, or helper exit as a postcondition.
- Private Codex APIs or proprietary assets.

## Git workflow

- Branch: `codex/003-truthful-live-postconditions`
- Commit message example: `Verify live key outcomes before success`
- Do not push or open a PR without explicit instruction.

## Steps

### Step 1: Make Permissions a live-state indicator

On appearance and refresh:

- resolve the exact focused task from Plan 002;
- read its live approval mode with a bounded timeout;
- render ASK, APPROVE, YOLO, or CUSTOM only when verified;
- render a neutral `UNKNOWN`/`NO DATA` state on missing focus, timeout, UI drift,
  or ambiguous control;
- never default an unverified state to YOLO.

Use a short-lived single-flight cache keyed by task ID so the 1.25-second refresh
does not spawn overlapping native reads. A successful press must read current
live state, apply exactly the next state, reread it, then persist/display it.
External changes must appear on the next refresh.

**Verify**: approval tests cover all four live states, wraparound, external state
change, missing focus, timeout, ambiguity, and stale saved settings.

### Step 2: Require a valid FAST pre-state and changed post-state

Do not suppress a failed FAST pre-read. Require:

1. verified exact target window;
2. verified initial Standard/Fast state;
3. empty draft;
4. `/fast` dispatch;
5. verified opposite state within a bounded timeout.

If either read fails or the state remains unchanged, return failure and show no
OK. Preserve the draft and restore/dismiss menus.

**Verify**: native and TypeScript tests cover Standard→Fast, Fast→Standard,
pre-read failure, unchanged post-state, transient unreadable post-state,
timeout, nonempty draft, and wrong-window state change.

### Step 3: Verify New Project's visible outcome

After the allowed `Cmd+O` shortcut, poll the exact focused Codex window for the
documented Add Project folder picker/sheet. Success requires that picker to be
visible and associated with Codex. If it does not appear, show a specific
failure and no OK.

Do not select a folder automatically; opening the picker is the key's complete
contract.

**Verify**: native fixture tests cover picker appears, unrelated system dialog,
no picker, delayed picker, and timeout.

### Step 4: Verify workflow and YEET outcomes

For all workflow keys, and especially YEET, success requires a newly focused
Codex task whose canonical cwd equals the requested focused cwd and whose
prefilled prompt equals the exact registry prompt. The prompt must remain a
draft; the key must not automatically submit or execute it.

Use the reconciled six-part observer above. The new task ID comes only from the
fresh primary/focused witness; the cwd comes only from the newly inserted
SQLite row keyed by that witnessed ID; the prompt comes only from the unique
composer in the retained focused AX window. Use bounded observation and fail on
cwd mismatch, prompt mismatch, ignored deep link, wrong/pre-existing task,
signal ambiguity, identity discontinuity, or timeout. Never substitute a
selected/recent project.

**Verify**: table-driven tests cover all workflow rows from pages 2–6, comparing
exact workflow ID, cwd, and prompt. Add connected-observer fixture tests for
matching and mismatching new tasks, multiple new rows, multiple fresh witnesses,
renderer history changes, AX-window replacement, composer ambiguity, symlink
cwd aliases, a witnessed ID absent from SQLite, and a correct prompt visible in
the wrong AX window.

### Step 5: Define truthful outcomes for remaining command keys

Use the 48-key contract to ensure:

- Plan proves a state transition.
- PTT proves down readiness and always releases on up/error.
- Compact proves `/compact` was accepted by the exact composer and observes the
  resulting visible state/message; it must not report success merely after
  typing.
- Accept/Reject operate only when a matching visible eligible control exists
  and verify that the pending state resolves.
- Send requires the intended exact composer and a nonempty draft, then verifies
  the draft was submitted.
- Sidebar verifies the sidebar state changed.
- Usage and Context remain display-only and never report a Codex mutation.
- Agent/New Chat/Skills navigation verifies the expected route/window.

If any key lacks a stable observable postcondition, STOP and report that key
rather than weakening its contract.

**Verify**: `npm test -- profile-keys.behavior` → 48/48 pass with explicit
success and failure postconditions.

### Step 6: Bound all native processes and refresh work

Give every `invoke` operation an explicit timeout and ensure child termination,
listener cleanup, and one settled promise. Add stable safe failure categories
for no focus, draft present, target mismatch, unavailable control, unchanged
state, and timeout.

**Verify**: timeout tests show child termination and one alert, with no later OK
or stale draw.

### Step 7: Run the full deterministic gate

**Verify**: `npm run check` → exit 0; visual report remains 48/48 with no layout
regressions.

## Test plan

- Permissions: every live state, cycle edge, stale cache, external change,
  missing/ambiguous state.
- FAST: both transitions and every failure point.
- New Project: verified folder picker only.
- Every workflow key: exact registry prompt and focused cwd.
- Every command/navigation key: named visible postcondition.
- All failures assert `showAlert`, no `showOk`, no fallback target, and no draft
  loss.
- Multi-window cases prove a state change in another window cannot satisfy the
  target postcondition.

## Done criteria

- [ ] Permissions never renders an unverified mode and never defaults unknown
      to YOLO.
- [ ] FAST requires a verified pre-state and opposite post-state.
- [ ] New Project verifies the Add Project picker.
- [ ] All workflow keys verify exact cwd and prompt in the new task.
- [ ] All command/navigation keys have explicit visible postconditions.
- [ ] Every native operation has a timeout and cleanup.
- [ ] All 48 behavior and visual cases pass.
- [ ] `npm run native:build` and `npm run check` exit 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status updated.

## STOP conditions

- Any key lacks a stable public/accessibility-visible postcondition.
- Verifying workflow cwd/prompt would require auto-submitting the prompt.
- Approval state cannot be read without focusing or mutating an unrelated task.
- A fix would require clearing, replacing, or submitting an existing draft.
- The exact target-window guarantee from Plan 002 is absent.

## Maintenance notes

Saved Stream Deck settings are caches, never authority. All future stateful
controls must display live state or explicit unknown. Reviewers should trace
every `showOk()` backward to a target-bound observable postcondition and reject
any path that ends at process exit, keystroke dispatch, or a fixed sleep.
