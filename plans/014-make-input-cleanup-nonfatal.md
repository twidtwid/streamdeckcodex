# Plan 014: Make synthesized-input cleanup non-fatal and attributable

**Status:** IN PROGRESS — implementation and automated gates pass; installed reload pending  
**Priority:** P0  
**Effort:** M  
**Risk:** Medium  
**Depends on:** Plan 013  
**Target baseline:** canonical public descendant established by Plan 013

## Why

The plugin has previously exited after an uncaught native-control failure during dictation cleanup. A lifecycle callback currently awaits `endDictation()` without a containment boundary, while the fallback `dictation-up` path may reject when `osascript` fails. Cleanup must always attempt to release synthesized input, but a failed release attempt must not crash the entire Stream Deck plugin or leave a modifier/mouse state held.

## Current state and evidence

Audited public source contains this lifecycle shape:

```ts
override async onWillDisappear(): Promise<void> {
  await endDictation();
}
```

The automation fallback calls `runControl("dictation-up")`, which rejects on a failed native invocation. Stream Deck logs observed during the audit include unexpected plugin exits and an uncaught `osascript` error originating from the automation layer. Startup/exit cleanup exists, but the lifecycle error path lacks an explicit best-effort contract and actionable, privacy-safe provenance.

## Drift check

```sh
git status --short
git rev-parse HEAD
rg -n "onWillDisappear|endDictation|dictation-up|cleanup" src test tests
```

Expected: lifecycle cleanup is still awaited directly or otherwise lacks the containment and test coverage described below. If Plan 013 or a newer public commit already introduced equivalent behavior, reconcile rather than duplicate it.

## Scope

- Define one idempotent cleanup primitive for all synthesized key/mouse/modifier release operations.
- Ensure disappearance, shutdown, cancellation, and exception paths invoke cleanup without crashing the plugin.
- Retain explicit user-facing failure feedback for a failed user-initiated PTT release.
- Record bounded, privacy-safe action/lifecycle provenance to diagnose the next fatal failure.
- Add event-path regression tests for paired down/up behavior and cleanup failures.

## Out of scope

- Changing PTT activation semantics or speech transcription.
- Adding new synthesized keyboard shortcuts.
- Model, reasoning, Plan, Fast, or session behavior.
- Logging transcripts, task IDs, filesystem paths, keystrokes, or composer contents.

## Git workflow

Create `codex/014-input-cleanup` from the completed Plan 013 commit. Commit cleanup behavior, tests, and documentation together. Do not deploy to the live plugin until the complete automated gate passes.

## Implementation steps

### 1. Inventory every synthesized input state

Build a table in the implementation notes for every native down/up or mouse-state pair, including PTT/dictation, modifiers, and any legacy action still reachable from the manifest/profile. Identify the owner and cleanup hook for each.

Verification:

```sh
rg -n "key.?down|key.?up|mouse.?down|mouse.?up|dictation-(down|up)|CGEvent|osascript" src native scripts test tests
```

Expected: every `down` has a named release path and a lifecycle cleanup owner.

### 2. Introduce an idempotent release guard

Create a small state guard that:

- records only whether a release is required, never typed content;
- makes repeated release calls safe;
- clears its in-memory held-state only after the release attempt completes;
- retries once through the safest direct native release path when appropriate;
- always settles with a structured result rather than throwing from lifecycle cleanup;
- supports an explicit `releaseAll(reason)` for shutdown and disappearance.

Keep user-initiated release separate from silent lifecycle cleanup: a user release failure should display a concise failure state; lifecycle cleanup should log the failure and keep the plugin alive.

### 3. Contain all lifecycle callbacks

Wrap `onWillDisappear`, plugin disconnect/exit hooks, action cancellation, and top-level fatal handlers. Cleanup must run from `finally` blocks where input may have been pressed. Never suppress the first meaningful error; attach the cleanup result as secondary diagnostic data.

### 4. Add privacy-safe runtime provenance

Maintain a bounded in-memory/event-log record containing only:

- build identity from Plan 013;
- action UUID/type;
- lifecycle phase (`down`, `up`, `disappear`, `shutdown`);
- monotonic sequence number;
- structured result/reason code.

Do not include titles, task IDs, transcripts, composer text, URLs, filesystem paths, or native command arguments. Log the last safe action record when a top-level failure is caught.

### 5. Verify installed behavior after reload

After automated tests pass, reload the installed plugin from the saved project. Exercise PTT press/release, disappear during hold, repeated release, and a controlled native-helper failure fixture. Confirm all controls remain rendered and responsive afterward.

## Test plan

- Unit test: down then up emits exactly one of each.
- Unit test: two cleanup calls emit at most one required release and both settle.
- Unit test: thrown action work still invokes release from `finally`.
- Unit test: native release failure does not reject `onWillDisappear` or terminate the plugin.
- Unit test: user-initiated release failure produces explicit feedback.
- Unit test: provenance contains allowed fields only; seed private-looking task IDs/paths/text and assert none appear.
- Integration fixture: simulate disconnect/disappear while held and assert the helper observes a release.
- Regression: existing Model, Reasoning, Plan/Fast, profile, and generated-output tests remain unchanged and pass.
- Connected check: hold/release PTT, navigate pages while held, then type normally in Codex; no modifier or mouse state remains held and the plugin stays connected.

## Verification commands

```sh
npm test
npm run typecheck
npm run build
npm run validate
npm run check
```

Use the project’s actual script names if they differ after Plan 013; document any substitution in the implementation notes.

## Machine-checkable done criteria

- [ ] No lifecycle callback can reject because a cleanup release failed.
- [ ] Every synthesized `down` path has a tested `finally`/lifecycle release path.
- [ ] Cleanup is idempotent under repeated disappear/shutdown calls.
- [ ] User-initiated failures remain visible while lifecycle failures remain non-fatal.
- [ ] Privacy test proves provenance excludes task IDs, titles, paths, transcripts, and composer text.
- [ ] Full project check and Elgato validation pass.
- [ ] Connected reload keeps normal labels/icons and leaves normal typing available after every PTT scenario.

## STOP conditions

- A native API cannot guarantee release without broad Accessibility or Input Monitoring permissions not already required; document the exact permission and request a user decision.
- A reachable action synthesizes input but its paired release behavior cannot be identified.
- Testing shows that clearing in-memory state before a successful release can strand a held input.
- Live verification would require injecting text into or submitting the user’s composer.

## Maintenance notes

- Any future synthesized-input action must register with the same release guard and add paired event-path tests.
- Treat an unexpected plugin exit after a `down` event as P0 until the OS-level release state is verified.
- Keep provenance schema stable and privacy-reviewed; it will feed the read-only doctor in Plan 017.
