# Plan 010: Use one native target transaction and one AX snapshot per poll

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only files listed as in scope. If a STOP condition occurs, stop and report;
> do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a36ba3f..HEAD -- native/CodexUIControl.swift test/native-target.fixture.test.ts test/native-approval.fixture.test.ts test/native-workflow.fixture.test.ts test/physical-input.acceptance.test.ts test/plan-mode.acceptance.test.ts test/model-dial.acceptance.test.ts`
> Plans 007 and 008 are expected to change native focus/composer paths.
> Reconcile those completed APIs before editing. Unrelated native mutations are
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH — native verification and unique-selector proofs are safety
  boundaries
- **Depends on**: Plans 007 and 008
- **Category**: perf, tests, tech-debt
- **Planned at**: commit `a36ba3f`, 2026-07-26

## Why this matters

A single Dispatch, Model, or Reasoning action currently performs the complete
target verifier as many as four times. Each verification rereads witness state,
finds the focused window, and traverses the AX tree for a unique composer.
Separately, YOLO confirmation and Add Project poll selectors that traverse the
whole tree and then recursively rescan many overlapping subtrees every 80ms.

After this plan, each task mutation has one explicit preflight and one
postflight, and each polling iteration builds one parent-aware AX snapshot used
by all selectors for that iteration. Ambiguity remains fail-closed; performance
comes from removing duplicate observations, not weakening proof.

## Current state

- `native/CodexUIControl.swift:989-1030` `verifyTarget()` checks frontmost state,
  global witness continuity, focused-window identity, and unique composer.
- `native/CodexUIControl.swift:1065-1085` `captureCurrentCodex()` already calls
  `verifyTarget()` while constructing `TargetContext`.
- `native/CodexUIControl.swift:2741-2765` Dispatch calls `targetRoot()` twice
  consecutively before dispatch and once afterward.
- `native/CodexUIControl.swift:2964-3006` Model and Reasoning each call
  `targetRoot()` before selection, before picker reread, and after confirmation.
- `native/CodexUIControl.swift:181-202` `allElements()` breadth-first traverses
  AX children and fetches role/title/description synchronously.
- `native/CodexUIControl.swift:1330-1375` Full Access confirmation traverses the
  app, then every container descendant subtree, then button subtrees.
- `native/CodexUIControl.swift:1475-1500` polls confirmation, dismissal, and
  final approval mode at 80ms intervals.
- `test/native-approval.fixture.test.ts:49+`,
  `test/plan-mode.acceptance.test.ts`, and
  `test/model-dial.acceptance.test.ts` still rely partly on source substrings.
  These tests can pass dead code and fail harmless function renames.
- Preserve paired mouse/key down/up release, frontmost checks, exact witness
  validation, unique controls, visible postconditions, and timeout behavior.

## Commands you will need

| Purpose         | Command                                                                                                                                                                                                | Expected on success                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Build native    | `npm run native:build`                                                                                                                                                                                 | exit 0                                           |
| Native fixtures | `npx vitest run test/native-target.fixture.test.ts test/native-approval.fixture.test.ts test/native-workflow.fixture.test.ts test/native-selector.fixture.test.ts`                                     | all pass                                         |
| Action tests    | `npx vitest run test/physical-input.acceptance.test.ts test/plan-mode.acceptance.test.ts test/model-dial.acceptance.test.ts test/reasoning-dial.acceptance.test.ts test/profile-keys.behavior.test.ts` | all pass                                         |
| Full gate       | `npm run check`                                                                                                                                                                                        | all tests, 51 keys, seven pages, validation pass |
| Diff hygiene    | `git diff --check`                                                                                                                                                                                     | no output                                        |

## Scope

**In scope**:

- `native/CodexUIControl.swift`
- `test/native-target.fixture.test.ts`
- `test/native-approval.fixture.test.ts`
- `test/native-workflow.fixture.test.ts`
- `test/native-selector.fixture.test.ts` (create)
- `test/physical-input.acceptance.test.ts`
- `test/plan-mode.acceptance.test.ts`
- `test/model-dial.acceptance.test.ts`
- `test/reasoning-dial.acceptance.test.ts`
- `test/profile-keys.behavior.test.ts`
- `plans/README.md` for status only

**Out of scope**:

- Removing or weakening exact-task witness checks from Plan 007
- Changing task routing, shortcuts, key labels/icons, approval order, model
  catalog, reasoning options, profile layout, or Stream Deck action contracts
- A generic accessibility framework or cross-application abstraction
- Using the first text/button match without uniqueness and ownership proof
- Connected destructive testing or claiming a complete reversible 51-key
  connected gate; Plan 004 remains honestly blocked

## Git workflow

- Branch: `codex/010-single-pass-native-control`
- Commit message example: `Simplify native control transactions`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Add behavioral selector and transaction characterization

Before refactoring, extract pure neutral decision functions used by production
and expose compiled fixture actions for them. Create
`test/native-selector.fixture.test.ts`.

Represent an AX observation as neutral nodes containing at least:

- stable fixture ID and optional parent ID;
- role, title, description/value/help text;
- frame, hidden/enabled flags, and depth.

Cover:

1. exactly one composer versus zero/two;
2. mode/permission control inside versus outside composer region;
3. YOLO confirmation requiring one container with exactly one Confirm and one
   Cancel;
4. nested containers selecting the unique smallest valid owner;
5. ambiguous confirmations rejected;
6. Add Project presentation versus persistent sidebar label/unrelated dialog;
7. a focus/witness change between preflight and postflight rejected;
8. operation call ordering: one preflight, operation, one postflight.

Replace source-string assertions for these behaviors with compiled fixture
outcomes. Keep narrowly scoped static checks only for unconditional synthesized
key/mouse release if no executable event seam can prove them.

**Verify**:
`npm run native:build && npx vitest run test/native-selector.fixture.test.ts test/native-target.fixture.test.ts test/native-approval.fixture.test.ts`
→ all named positive/negative behaviors pass.

### Step 2: Build one parent-aware AX snapshot per observation

Replace or extend `allElements()` with a bounded snapshot builder that records
each node once, including parent index/depth and attributes needed by current
selectors. Do not eagerly fetch attributes no selector uses.

Provide pure queries over `[SnapshotNode]` for:

- composer candidates;
- controls in a composer's geometric region;
- menu item labels and approval modes;
- Full Access confirmation owner/buttons;
- Add Project picker identity/presentation.

An actual click still uses the retained `AXUIElement` from the chosen node.
Every wait-loop closure must build exactly one fresh snapshot, then run all
queries on it. UI state changes after a click require a new snapshot on the
next iteration.

Avoid recursive `subtreeText()` scans from every candidate. Derive descendant
text through parent/depth relationships in the one snapshot.

Add a fixture-visible traversal counter or pure query counter proving one
snapshot build per polling iteration and no nested traversal from a candidate.

**Verify**:
`npm run native:build && npx vitest run test/native-selector.fixture.test.ts test/native-approval.fixture.test.ts`
→ selector behavior is unchanged and traversal-count assertions pass.

### Step 3: Introduce one explicit target transaction shape

Refactor current-task actions to use this lifecycle:

1. capture current task witness and focused AX window;
2. perform exactly one full preflight immediately before the mutation;
3. run the operation and its visible local postcondition against the retained
   target window, refreshing AX snapshots only when UI state changes;
4. perform exactly one full postflight witness/window verification;
5. emit success only after both local postcondition and postflight succeed.

Do not call `targetRoot()` multiple times from a switch case. Prefer an explicit
`TargetTransaction`/helper with named `preflight()` and `postflight()` methods,
or equivalently clear code; avoid a generic closure abstraction that hides
which actions mutate.

Workspace-surface shortcuts may retain their documented frontmost-only
postflight if opening the panel intentionally changes the internal AX
presentation. Add an explicit fixture for that exception.

**Verify**:
`npm run native:build && npx vitest run test/native-target.fixture.test.ts test/native-selector.fixture.test.ts test/native-workflow.fixture.test.ts`
→ all call-order and failure-boundary cases pass.

### Step 4: Migrate Dispatch, Model, Reasoning, Permissions, and New Project

Convert each action individually and run its focused tests before continuing:

1. Dispatch, including Compact and workspace surfaces;
2. Model;
3. Reasoning;
4. Permissions read/cycle using the combined snapshot from Plan 008;
5. New Project picker detection.

For each:

- preserve current timeout and explicit failure message/reason code;
- preserve fail-closed ambiguity;
- assert the visible postcondition;
- assert one preflight and one postflight where applicable;
- remove duplicate `targetRoot()`/`allElements()` calls only after its fixture
  passes.

Do not migrate workflow/new-chat creation proof in this plan; they create a new
identity rather than mutate the captured current task and need a separate
shared-new-thread proof.

**Verify**:
`npx vitest run test/physical-input.acceptance.test.ts test/plan-mode.acceptance.test.ts test/model-dial.acceptance.test.ts test/reasoning-dial.acceptance.test.ts test/profile-keys.behavior.test.ts`
→ all pass; the exhaustive handler test still covers all 51 keys.

### Step 5: Delete replaced source-string assertions

For each source-string test in the in-scope test files:

- delete it if a compiled fixture now proves the same behavior;
- convert registry/policy assertions to direct imports and typed values;
- retain only static rules that cannot be safely executed, and make them
  narrowly parse the relevant construct rather than depend on indentation or
  broad phrase presence.

Run:

```sh
rg -n "readFileSync|toContain\\(|source\\.slice" \
  test/physical-input.acceptance.test.ts \
  test/plan-mode.acceptance.test.ts \
  test/model-dial.acceptance.test.ts \
  test/reasoning-dial.acceptance.test.ts
```

Expected: every remaining match has a documented non-executable safety reason;
no selector, routing, transaction, or postcondition behavior is asserted only
by source text.

**Verify**: run the Action tests command from the command table → all pass.

### Step 6: Run the complete gate

Run `npm run check`.

**Verify**: exit 0 with all tests passing, 51 key handlers/visuals accounted
for, 102 raster artifacts, seven pages, and successful Stream Deck validation.

## Test plan

- Compiled neutral selector fixtures cover positive, ambiguous, wrong-owner,
  hidden, and off-window cases.
- Transaction fixtures assert exact call order and reject focus changes.
- Existing native target fixtures retain cross-file focus safety from Plan 007.
- Existing Permissions/YOLO fixtures retain current confirmation semantics.
- Action tests call registries and adapters directly rather than searching
  source text.
- The full 51-key handler and visual matrices remain mandatory.

## Done criteria

- [ ] Each targeted mutation has one preflight and one postflight.
- [ ] Each selector poll builds one AX snapshot and performs no nested AX walk.
- [ ] Unique-owner/unique-control ambiguity remains fail-closed.
- [ ] Permissions question detection and YOLO confirmation remain correct.
- [ ] Selector/transaction correctness is proved by compiled fixtures, not
      source strings.
- [ ] All 51 key handlers and all 51 visuals pass.
- [ ] `npm run check` and `git diff --check` pass.

## STOP conditions

Stop and report if:

- reducing target checks would create a window between preflight and mutation
  where the target can change without postflight detection;
- a selector needs attributes unavailable from one bounded snapshot;
- snapshot nodes cannot retain a safe clickable `AXUIElement`;
- unique confirmation or picker ownership would be weakened;
- any source-string test has no executable replacement and enforces a genuine
  safety invariant;
- any key behavior or visual contract changes.

## Maintenance notes

Refresh snapshots when UI state changes, not when another predicate wants the
same state. Future selectors should be pure queries over the snapshot. Review
native diffs for accidental removal of paired input release, exact-target
postflight, or ambiguity rejection; performance is not permission to weaken
those proofs.
