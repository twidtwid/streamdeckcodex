# Plan 008: Replace overlapping polls with one serialized composer snapshot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only files listed as in scope. If a STOP condition occurs, stop and report;
> do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c58909b..HEAD -- src/plugin.ts src/lib/codex-ui-control.ts src/lib/codex-store.ts src/actions/approval-mode.ts native/CodexUIControl.swift test/local-store.integration.test.ts test/profile-keys.behavior.test.ts test/live-approval-status.test.ts test/native-approval.fixture.test.ts`
> Any change to refresh scheduling, live-input state, focused-row projection,
> native witness validation, or permission concurrency is a STOP condition
> until this plan is reconciled.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED — stale reads around YOLO confirmation must remain impossible
- **Depends on**: Plan 007
- **Category**: perf, tech-debt, bug
- **Planned at**: approved Plan 007 tip `c58909b`, 2026-07-26

## Why this matters

The global 1.25-second interval can start a new refresh while the previous
refresh is still running. With the Permissions key visible, one tick launches
the native helper for pending input and then launches it again for approval
mode. `ApprovalModeAction` consequently owns four maps for caching,
single-flight reads, mutation generations, and stale-read suppression.

After this plan, refreshes never overlap and one immutable focused-composer
snapshot supplies pending-input and permission state to every consumer. The
generation boundary remains, but it has one owner instead of being
special-cased inside the button action.

## Current state

- `src/plugin.ts:38-56` defines one async `refresh()` and
  `src/plugin.ts:82` starts it with:

  ```ts
  setInterval(() => void refresh(), 1250).unref();
  ```

  `setInterval` does not await the previous call.

- `src/plugin.ts:40` first awaits `codexStore.refreshLiveInput()`, then
  `src/plugin.ts:41-52` refreshes every action concurrently.
- `src/lib/codex-ui-control.ts:227-241` launches `input-read` with a 1200ms
  timeout and returns pending state/title.
- `src/actions/approval-mode.ts:21-32` uses a 900ms cache, 2500ms read timeout,
  `#live`, `#reads`, `#generation`, and `#mutating`. Since the global cadence is
  1250ms, the approval cache is cold on every ordinary tick.
- `native/CodexUIControl.swift:2692-2775` reads pending input from
  `kAXFocusedWindowAttribute`. `native/CodexUIControl.swift:2966-2990`
  separately gets the focused window and reads approval mode.
- `test/profile-keys.behavior.test.ts:449-503` contains meaningful concurrency
  tests: shared reads must be single-flight and an old read must not overwrite
  a completed permission mutation. Preserve those guarantees.
- At approved tip `c58909b`, the live question detector intentionally accepts a
  visible `Awaiting approval` row even when AX selected/focused flags are false.
  Do not restore those fragile requirements.
- `src/lib/codex-store.ts:327-363` now resolves the focused task with the Plan
  007 exact-ID projection. Use that API; do not reconstruct selected/recent
  identity in the composer layer.

## Commands you will need

| Purpose          | Command                                                                                                                                                     | Expected on success                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Build native     | `npm run native:build`                                                                                                                                      | exit 0                                           |
| Focused tests    | `npx vitest run test/refresh-coordinator.test.ts test/live-approval-status.test.ts test/native-approval.fixture.test.ts test/profile-keys.behavior.test.ts` | all pass                                         |
| Typecheck        | `npm run typecheck`                                                                                                                                         | exit 0                                           |
| Full 51-key gate | `npm run check`                                                                                                                                             | all tests, 51 keys, seven pages, validation pass |
| Diff hygiene     | `git diff --check`                                                                                                                                          | no output                                        |

## Scope

**In scope**:

- `src/plugin.ts`
- `src/lib/refresh-coordinator.ts` (create)
- `src/lib/codex-ui-control.ts`
- `src/lib/codex-store.ts`
- `src/actions/approval-mode.ts`
- `native/CodexUIControl.swift`
- `test/refresh-coordinator.test.ts` (create)
- `test/local-store.integration.test.ts`
- `test/live-approval-status.test.ts`
- `test/native-approval.fixture.test.ts`
- `test/profile-keys.behavior.test.ts`
- `plans/README.md` for status only

**Out of scope**:

- Changing the 1250ms nominal cadence without measurement
- Polling FAST by opening/closing the model picker
- Changing Plan/FAST toggle semantics, model/reasoning selectors, approval-mode
  order, labels, colors, icons, or profile layout
- Removing stale-read protection without replacing it centrally
- Making read-only refresh activate Codex, click controls, open menus, or type
- Adding selected/newest task fallback

## Git workflow

- Branch: `codex/008-serialized-composer-snapshot`
- Commit message example: `Centralize live composer refresh`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Add a tested non-overlapping refresh coordinator

Create `src/lib/refresh-coordinator.ts` as a small generic scheduler. It must:

- run one async callback at a time;
- coalesce any timer tick received while a run is active into at most one
  follow-up run;
- schedule relative to completion or skip overlap; never build an unbounded
  promise queue;
- expose `start()`, `runNow()`, and `stop()` or an equivalently small API;
- `unref()` its timer in production;
- report callback failures to an injected handler while continuing future
  refreshes.

Use injected timer functions or fake timers in
`test/refresh-coordinator.test.ts`. Prove:

1. a callback slower than the cadence never overlaps itself;
2. ten ticks during one run produce at most one coalesced follow-up;
3. rejection is reported and the next run still occurs;
4. `stop()` prevents later runs.

Update `src/plugin.ts` to use the coordinator. Preserve one initial awaited
refresh after `streamDeck.connect()`.

**Verify**:
`npx vitest run test/refresh-coordinator.test.ts`
→ all four concurrency cases pass.

### Step 2: Define one live composer result envelope

In `src/lib/codex-ui-control.ts`, replace the input-only public type with a
`LiveComposerState` that contains:

- `pendingInput: boolean`;
- optional `inputKind` and `inputTitle`;
- optional `approvalMode`;
- `conversationId: string`;
- `rendererWindowId: string`.

Add one `readLiveComposerState()` wrapper invoking a new native
`composer-read` action for the authoritative task ID from Plan 007. The result
must add `conversationId` beside the existing `rendererWindowId` in
`NativeControlResult` and echo both observed values from the globally newest
Codex witness. AX does not expose the desktop log's renderer ID directly; use
Plan 007's existing same-observation proof instead: the globally newest log
witness is focused/primary, Codex is frontmost, and one retained AX focused
window is among the current windows with one composer. Echo the renderer ID
from that verified witness. TypeScript accepts the result only when the
requested and returned conversation IDs match and both identity fields are
nonempty. Do not launch a separate `target-check`; that would restore the
duplicate helper process this plan removes. Keep the result observation-only.
Pending-input detection must remain usable even when approval-mode parsing is
temporarily unavailable; represent approval mode as optional instead of
failing the whole snapshot.

Retire `readLiveInputState()` and production `readLiveApprovalMode()` after all
callers move. Update `test/local-store.integration.test.ts` to inject
`liveComposerReader` and call `refreshLiveComposer()` directly; do not retain a
deprecated production constructor/method solely for old tests.

**Verify**:
`npm run typecheck`
→ no duplicate live-input/approval-read public state path remains.

### Step 3: Implement one native focused-window composer read

Add `composer-read` to the native action switch. It must:

1. obtain `kAXFocusedWindowAttribute` without activating Codex;
2. resolve the globally newest Codex witness using Plan 007, require its
   conversation ID to equal the requested task ID, and prove the retained
   focused AX window through Plan 007's unique-window/unique-composer
   conjunction;
3. traverse that retained window once for the current observation;
4. derive pending input, owner title, and approval mode from that observation;
5. return the observed conversation/renderer identity with optional
   `approvalMode` when the permission selector is
   unavailable, provided pending-input state was observed successfully;
6. perform no click, keyboard event, deep link, menu opening, or activation.

Reuse the visible pending-label predicate introduced at `a36ba3f`. Add compiled
fixtures covering:

- visible `Awaiting approval` with false selected/focused flags;
- hidden, frameless, and off-window labels rejected;
- exact approval-mode mapping for Ask, Approve, YOLO, Custom;
- pending state still returned when approval control is absent;
- owner title from sibling static text and enclosing row-button shapes.
- requested/observed task mismatch returns unavailable state and cannot be
  cached under the requested task.

Delete separate live `input-read` and `approval-read` dispatch branches only
after the combined fixture is green. `input-dump` may remain as a diagnostic,
but it must not be used by production refresh.

**Verify**:
`npm run native:build && npx vitest run test/live-approval-status.test.ts test/native-approval.fixture.test.ts`
→ all combined-state and regression cases pass.

### Step 4: Move single-flight and generation ownership into `CodexStore`

Replace `refreshLiveInput()` with `refreshLiveComposer()`. The store owns:

- one cached snapshot for the authoritative focused task;
- one in-flight read promise;
- one monotonically increasing generation;
- a mutation-in-progress boundary.

Add a store method for permission cycling that:

1. resolves the exact focused task from Plan 007;
2. increments the generation and marks mutation active;
3. awaits `cycleLiveApprovalMode`;
4. stores the confirmed returned mode in the current snapshot;
5. clears mutation state in `finally`;
6. forces one post-mutation composer read;
7. ignores any read started before the mutation generation.

The native cycle result must return its postflight `conversationId` and
`rendererWindowId`. Before caching that result, the store must re-resolve the
authoritative Plan 007 focused task and complete the required post-mutation
`composer-read`. Require:

1. the requested ID equals the returned conversation ID;
2. the returned conversation ID equals the current exact-ID focused task;
3. the post-mutation composer snapshot has the same conversation and
   renderer-window IDs as the native cycle result.

A focus switch during the async cycle is a failed mutation: invalidate the
stale snapshot, do not cache the returned mode under either task, and surface
failure to the action.

The native mutation must not merely check that a task ID string was supplied.
After bringing Codex forward, it must resolve the globally newest witness,
require that witness to match the requested task ID, retain that focused AX
window, and perform the read-cycle-YOLO-confirm-verify transaction against that
window. A task mismatch must fail before clicking the permission control.

The store must still expose pending state to `applyFocusedLiveInput`. A failed
read should produce unavailable/unknown display state; it must not erase a
newer confirmed mutation result.

Model this after the existing race semantics in
`test/profile-keys.behavior.test.ts`, not after its implementation details.

**Verify**:
`npx vitest run test/live-approval-status.test.ts test/profile-keys.behavior.test.ts`
→ single-flight, stale-read, mutation, and 51-key cases pass.

### Step 5: Reduce `ApprovalModeAction` to event handling and drawing

Delete `#live`, `#reads`, `#generation`, `#mutating`,
`LIVE_CACHE_MS`, and `LIVE_READ_TIMEOUT_MS` from the action. The action should:

- ask `CodexStore` for the current composer snapshot when appearing/refreshing;
- ask `CodexStore` to cycle permissions on key down;
- persist the confirmed mode to action settings;
- draw only the supplied mode;
- show OK only after a confirmed mutation and show Alert on failure.

There must be no second native read path inside the action.

Run:

```sh
rg -n "readLiveInputState|readLiveApprovalMode|LIVE_CACHE_MS|#reads|#generation|#mutating" src/actions/approval-mode.ts
```

Expected: no matches. Store-level generation and mutation fields are the one
allowed concurrency owner.

**Verify**:
`npx vitest run test/profile-keys.behavior.test.ts`
→ every one of the 51 key handlers still passes, including Permissions cycle
and no-focused-task rejection.

### Step 6: Run the complete gate

Run `npm run check`.

**Verify**: exit 0 with all test files passing, 51 rendered keys, 102 raster
artifacts, seven pages, and successful Stream Deck validation.

## Test plan

- New scheduler tests prove non-overlap and bounded coalescing deterministically.
- Compiled native fixtures prove the combined read is observation-only and
  recognizes the current Codex AX shapes.
- Store/action tests retain the existing two-key single-flight and stale-read
  race coverage.
- Live question regression stays covered: selected/focused flags are not
  required for visible pending state.
- `test/profile-keys.behavior.test.ts` continues to execute all 51 key handlers.
- Full visual QA continues to render all 51 keys at 144px and 72px.

## Done criteria

- [ ] No refresh callback can overlap another refresh callback.
- [ ] Steady state launches at most one composer-read helper per tick.
- [ ] Pending input and approval mode come from one immutable snapshot.
- [ ] Permission mutation has one centralized generation boundary.
- [ ] `ApprovalModeAction` owns no cache, promise, generation, or mutation map.
- [ ] The live question regression and YOLO confirmation fixtures pass.
- [ ] All 51 handlers and all 51 key visuals pass the full gate.
- [ ] `git diff --check` produces no output.

## STOP conditions

Stop and report if:

- Plan 007 has not landed or focused identity cannot be associated with the
  snapshot without selected/recent fallback;
- combining reads requires activating Codex or opening the FAST/model picker;
- the current AX tree cannot return pending-input state and approval mode from
  the same focused window;
- stale pre-confirmation reads can overwrite a completed permission mutation;
- any connected YOLO confirmation or live question behavior regresses;
- any of the 51 key contract cases fails.

## Maintenance notes

All new read-only composer fields should join this snapshot rather than create
another polling action. Do not add FAST to periodic observation unless Codex
exposes it without opening a menu; an interactive read is not a refresh.
Reviewers should focus on the generation boundary and verify that helper
failures degrade to Unknown without erasing newer state.
