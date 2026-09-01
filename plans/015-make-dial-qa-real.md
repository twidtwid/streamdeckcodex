# Plan 015: Make Model and Reasoning QA execute the real event path

**Status:** DONE — connected registered-action gate passed and restored state on Sagan
**Priority:** P1  
**Effort:** M  
**Risk:** Medium  
**Depends on:** Plans 013 and 014  
**Target baseline:** canonical public descendant with non-fatal input cleanup

## Why

Model and Reasoning controls have repeatedly passed stored-state or helper-level tests while doing nothing in the visible Codex task. The existing connected-QA script discovers an active thread ID but omits it from mode/model/reasoning native calls. Several tests exercise pure functions or source strings instead of the actual Stream Deck `dialUp` handler. Passing QA therefore does not prove that a physical encoder press targets the visible task or mutates it exactly once.

## Current state and evidence

### 2026-09-01 connected-gate result

Accessibility is restored and the exact frontmost task/window witness succeeds.
The bounded traversal now includes the observed depth-27 composer. Current
Chromium placeholder and advanced-picker changes are covered by compiled
fixtures. On Sagan, the registered action-event gate proved preview-only rotate,
one apply per press, visible Model/Reasoning/Plan postconditions, and restoration
of the original Terra/Light/Plan-off state.

The audited connected-QA script has this effective pattern:

```js
const activeThreadId = /* discovered earlier */;
await native("mode-toggle", "plan");
await native("model-set", selectedModel);
await native("reasoning-set", selectedReasoning);
```

The discovered ID is not passed to those target-sensitive commands or their later readbacks. Native current-task operations require an explicit target. Historical runtime logs also contain `No active Codex task` for both Terra and reasoning apply attempts.

## Drift check

```sh
git status --short
git rev-parse HEAD
rg -n "activeThreadId|model-set|reasoning-set|mode-toggle|onDialUp|dialUp" scripts src test tests
```

Expected: at least one QA/native call still omits the exact visible task identifier or the tests still bypass the action handler. If newer work fixed this, retain the plan only for remaining event-path and connected postcondition gaps.

## Scope

- Target every connected native mutation/readback to the same authoritative visible task.
- Test the actual registered Stream Deck action handler for encoder rotation and press.
- Prove rotation is preview-only and press dispatches exactly one parameterized mutation.
- Restore the exact original model/reasoning state after connected QA.
- Fail explicitly when focus, composer safety, Accessibility, or postcondition verification is unavailable.
- Add an opt-in connected-device gate that cannot be confused with ordinary CI.

## Out of scope

- Deciding which models/efforts are supported; Plan 016 owns capability selection.
- Mutating background tasks or persisted task records as a fallback.
- Generic keyboard command palettes.
- Automatically running connected UI mutation tests in unattended CI.

## Git workflow

Create `codex/015-real-dial-qa` from the completed Plan 014 commit. Keep fixtures deterministic. Mark connected tests with an explicit environment flag and retain their structured journal as an ignored local artifact.

## Implementation steps

### 1. Define one authoritative active-task fixture

Resolve the visible focused Codex task once at test start using the same bounded active-chat resolver as production. Capture:

- exact task/thread ID for native targeting;
- visible title only for human console output, never assertions;
- composer empty/nonempty state;
- current model and reasoning effort;
- app foreground/focus state.

Abort before any mutation if the visible task cannot be verified or the composer contains a draft.

### 2. Thread the exact target through every native call

Update all mode/model/reasoning mutation and readback calls to include the captured target explicitly. Reject helper APIs that silently fall back to “current” or recent cached tasks.

Verification: a spy fixture must assert every target-sensitive call carries the same ID; a mismatched or omitted ID fails before dispatch.

### 3. Exercise the registered action event path

Instantiate/register the real Model and Reasoning Stream Deck actions with a fake action context and native adapter spy. Drive the same event objects emitted by the SDK:

- `dialRotate`: update local pending choice and feedback only;
- `dialUp`: dispatch exactly one selected value to the exact task;
- repeated press: one dispatch per press, no duplicate listeners;
- disappear/reappear: pending state resets according to the documented rule without mutation.

Do not assert implementation source text. Assert observable calls and feedback payloads.

### 4. Add postcondition and rollback journaling

For connected tests:

1. read original value from the visible composer/task UI;
2. choose a different supported value;
3. rotate and prove no native mutation/readback change occurred;
4. press and prove exactly one dispatch;
5. verify the visible UI reports the requested value;
6. restore the original value using the same targeted adapter;
7. verify restoration.

Write only values, reason codes, build SHA, and sequence counts to the local QA journal. Do not store composer content or task IDs in committed artifacts.

### 5. Make failure visible and truthful

Map preflight and postcondition failures to clear device states such as `NO CHAT`, `DRAFT`, `ACCESS`, `BUSY`, `UNSUPPORTED`, or `VERIFY`. Never render `APPLIED` solely because dispatch returned without throwing.

### 6. Reload and perform the connected gate

Build, validate, reload the saved-project plugin, then test both physical encoder turns and presses in the currently visible Codex task. Confirm the device pending/applied indication and visible Codex model/reasoning fields agree.

## Test plan

- Event-path tests for Model and Reasoning rotation: zero mutation calls.
- Event-path tests for Model and Reasoning press: exactly one targeted mutation call.
- Tests for omitted/mismatched task ID: fail closed.
- Tests for draft/non-focused/background/busy UI: no mutation and explicit reason.
- Tests for failed postcondition: never report applied.
- Tests for cleanup after listener teardown: no duplicate dispatch.
- Connected test for change and restore on the same task.
- Regression gate for PTT paired-release safety from Plan 014.
- Regression gate for Plan/Fast shared active-chat targeting.

## Verification commands

```sh
npm run test:unit
npm run qa:dial-events
npm run check
STREAMDECK_CONNECTED_QA=1 npm run qa:dial-events:connected
```

If these script names differ, add aliases with these clear semantics rather than hiding connected mutation inside a generic test command.

Expected connected output includes the build SHA, verified focus, empty composer, rotation mutation count `0`, press mutation count `1`, visible postcondition, and successful restoration for both controls.

## Machine-checkable done criteria

- [x] Every target-sensitive QA call carries the exact captured visible task ID.
- [x] Real `dialRotate` handler tests observe zero model/reasoning dispatches.
- [x] Real `dialUp` handler tests observe exactly one dispatch with the selected value.
- [x] `APPLIED` feedback requires a visible postcondition match.
- [x] Connected QA restores the original model and reasoning on the same task.
- [x] Connected QA is opt-in and cannot pass when no device/focused task is available.
- [x] PTT safety and Plan/Fast targeting regressions pass after reload.

## STOP conditions

- The visible task contains a user draft.
- The task ID, foreground Codex app, or visible postcondition cannot be verified.
- The current model offers only one supported choice, preventing a reversible mutation test.
- Restoration fails; leave the explicit current value visible and report immediately.
- Testing would require generic command-palette navigation or text submission.

## Maintenance notes

- Any new physical control must have an action-handler test, not only a library/helper test.
- Ordinary CI may verify fixtures and event paths but must never claim connected hardware success.
- Connected evidence expires when build SHA, Codex version, Stream Deck version, or device profile changes.
