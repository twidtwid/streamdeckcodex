# Plan 012: Close the remaining native visibility regressions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only files listed as in scope. If any STOP condition occurs, stop and report;
> do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2b31dc3..HEAD -- native/CodexUIControl.swift test/native-selector.fixture.test.ts`
> Expected: no output. Any change to either file after the frozen Plan 010 tip
> is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: HIGH — these selectors gate exact-target UI mutation and YOLO
  confirmation
- **Depends on**: Plans 007 through 010, using frozen Plan 010 tip `2b31dc3`
- **Category**: correctness, tests
- **Planned at**: commit `2b31dc365e3c2724a025bbdbef8177e02dd750f9`,
  2026-07-26

## Why this matters

Plan 010 closed its original transaction, ownership, complexity, and polling
findings, but its final independent review found two regressions that the green
402-test gate did not cover:

1. composer and composer-region control selectors check only each node's own
   hidden flag and frame, not the effective ancestor/window visibility already
   computed by `NeutralAXQuery`;
2. Full Access confirmation classifies Confirm and Cancel from direct button
   text before visible descendant text is aggregated, so Electron buttons whose
   label is exposed through a child static-text node are rejected.

This closure keeps the frozen Plan 010 architecture and repairs only those two
gaps with compiled behavioral fixtures.

## Scope

**In scope**:

- `native/CodexUIControl.swift`
- `test/native-selector.fixture.test.ts`
- `plans/README.md` for status only

**Out of scope**:

- Any profile, key, dial, label, icon, action, routing, timeout, approval-order,
  model, reasoning, or workspace behavior change
- Further transaction architecture or AX abstraction
- Changes to Plan 009 runtime/cache files
- Connected destructive testing

## Git workflow

- Branch: `codex/012-native-visibility-closure`
- Commit message example: `Close native visibility regressions`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Make composer and control selection use effective visibility

Update `uniqueComposerIndex` and `controlIndex` to require
`query.ownerIsVisible(index)` (or the same precomputed effective visibility
value) rather than checking only the node's direct hidden flag/frame.

Add compiled selector fixtures covering:

- visible composer/control accepted;
- composer below a hidden ancestor rejected;
- composer outside its retained window rejected;
- permission/mode control below a hidden ancestor rejected;
- permission/mode control outside the retained window rejected;
- two effectively visible composers remain ambiguous and fail closed.

The fixtures must call the same production selectors. Do not add detached
booleans or source-string assertions.

### Step 2: Restore descendant-label Full Access confirmation

Aggregate `visibleDescendantText` before confirmation button classification.
Classify each visible enabled button using its aggregated visible descendant
text, while retaining the precomputed button-to-intersecting-ancestor counts
and indices from Plan 010.

Add compiled fixtures where Confirm and Cancel buttons have blank direct text
and child static-text labels. Cover:

- both descendant labels accepted;
- hidden child label rejected;
- off-owner child/button geometry rejected;
- duplicate descendant Confirm remains ambiguous and rejected.

Do not restore candidate-time descendant scans or pairwise candidate
comparison.

### Step 3: Run the complete gate

Run:

```sh
npm run native:build
npx vitest run test/native-selector.fixture.test.ts test/native-target.fixture.test.ts test/native-approval.fixture.test.ts test/native-workflow.fixture.test.ts
npx vitest run test/physical-input.acceptance.test.ts test/plan-mode.acceptance.test.ts test/model-dial.acceptance.test.ts test/reasoning-dial.acceptance.test.ts test/profile-keys.behavior.test.ts
npm run check
git diff --check
git diff --stat 2b31dc3..HEAD
```

The full gate must still report all 51 keys, 102 rasters, and seven pages.
If only the final validator fails because sandboxed DNS cannot resolve the npm
registry, report it exactly; the reviewer will rerun validation with network
access.

## Done criteria

- [ ] Composer and composer-region controls require effective ancestor/window
      visibility.
- [ ] Hidden-ancestor and off-window composer/control fixtures fail closed.
- [ ] Full Access recognizes visible descendant button labels.
- [ ] Hidden, off-owner, and duplicate descendant-label fixtures fail closed.
- [ ] No per-candidate full-tree scan or pairwise ambiguity loop returns.
- [ ] The one-capture polling seam and ordered target transaction remain intact.
- [ ] Native, action, full, design, and validator gates pass.
- [ ] Cumulative diff from `2b31dc3` touches only the two in-scope source/test
      files.

## STOP conditions

Stop and report if:

- the fix requires weakening exact-target, uniqueness, ownership, or visibility
  checks;
- Electron exposes the needed label through attributes absent from the bounded
  snapshot;
- the fix requires changing profile behavior or any out-of-scope file;
- any existing Plan 010 fixture regresses.
