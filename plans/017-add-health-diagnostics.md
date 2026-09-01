# Plan 017: Add explicit availability reasons and a read-only Health/Doctor surface

**Status:** DONE  
**Priority:** P1  
**Effort:** L  
**Risk:** Medium  
**Depends on:** Plans 013, 014, and 016  
**Target baseline:** canonical public descendant with build identity, safe cleanup, and unified capabilities

## Why

Device faces currently collapse distinct failures into `UNKNOWN`, `NO DATA`, or no-op behavior. No focus, Codex in the background, Accessibility denial, stale rollout data, unsupported schema, timeout, and target mismatch are operationally different and require different remedies. The plugin needs explicit internal reason codes and a strictly read-only diagnostic surface that answers “what is unavailable, why, and which build is running” without exposing private task content.

## Current state and evidence

- Live composer unavailability is commonly represented by `undefined`.
- approval/permission snapshot failures collapse to unknown.
- context snapshot returns `undefined` for no task, missing events, stale data, malformed data, or read failure.
- native adapter catches often return `undefined` regardless of cause.
- existing success-oriented types do not preserve availability provenance.
- usage and settings paths contain separate JSON-RPC/app-server transport logic, making a third diagnostic implementation likely unless transport is shared deliberately.

## Drift check

```sh
git status --short
git rev-parse HEAD
rg -n "undefined|UNKNOWN|NO DATA|unavailable|app-server|initialize|account/rateLimits" src/lib src/actions src/types.ts scripts
```

Expected: multiple distinct unavailability paths still collapse to the same value and no read-only doctor reports build/runtime health.

## Scope

- Add a discriminated availability result with stable reason codes.
- Preserve reasons through focus, composer, context, permission, usage, model, reasoning, and native adapters.
- Log transitions only when a component’s reason changes.
- Add `npm run doctor` as a non-mutating local diagnostic.
- Add a read-only Health action/property-inspector surface without changing the canonical bundled profile.
- Consolidate only the bounded app-server transport needed to avoid duplicate diagnostic clients.
- Protect task privacy by default.

## Out of scope

- Automatically repairing permissions or changing Codex settings.
- Adding Health to the bundled device profile or displacing an existing control.
- Sending diagnostics over the network.
- Logging titles, task/thread IDs, prompts, transcripts, composer text, URLs, or full filesystem paths.

## Git workflow

Create `codex/017-health-doctor` from the completed Plan 016 commit. Keep reason-code introduction and surface rendering in reviewable commits. Add privacy tests before wiring logs.

## Implementation steps

### 1. Define stable availability types

Introduce a result such as:

```ts
type Availability<T> =
  | { state: "ready"; value: T; observedAt: number }
  | {
      state: "unavailable";
      reason:
        | "no-focus"
        | "codex-background"
        | "accessibility"
        | "stale"
        | "unsupported-schema"
        | "timeout"
        | "target-mismatch"
        | "busy"
        | "not-exposed";
      observedAt: number;
    };
```

Exact names may change, but the set must be documented, finite, machine-readable, and mapped to compact device labels separately.

### 2. Preserve reasons at source boundaries

Update each reader/adapter to distinguish causes at the point they are knowable. Do not infer Accessibility denial from a generic timeout. Preserve an underlying bounded error category internally, but never raw native output on the device.

Context must distinguish at least no focused task, no exposed token event, stale value, malformed/unsupported data, and read failure. Permission state must distinguish not exposed from inaccessible. Model/reasoning must use Plan 016 capability reasons.

### 3. Add transition-based diagnostics

Maintain last-known component health and log only when state/reason changes, plus a bounded startup snapshot. Include build identity and component name. Redact or omit all private identifiers and content.

### 4. Consolidate a bounded read-only app-server transport

Extract the common initialization/request/framing logic currently duplicated by usage/settings code. Give requests explicit read-only or mutating classification. The doctor may use only read-only methods and must fail if asked to invoke a mutating method.

Add a compatibility canary that performs initialization and a bounded read-only metadata/list request. It must not update task settings, create turns, submit text, or change focus.

### 5. Implement `npm run doctor`

The command should print a compact table or JSON option containing:

- plugin version and build SHA;
- manifest/SDK/runtime target;
- installed plugin link target classification (`saved-project`, `other`, `missing`) without printing the full path by default;
- Stream Deck process/plugin connection state;
- Codex foreground/focus availability;
- Accessibility availability;
- focused-task resolution health;
- context, permission, usage, model, and reasoning availability reasons;
- read-only app-server canary result;
- last synthesized-input cleanup result from Plan 014 when available.

Exit `0` only when core runtime is healthy; use documented nonzero codes for degraded and incompatible states. Add `--json` for issue reports and `--include-paths` as an explicit local opt-in.

### 6. Add an optional Health action/property inspector

Register a read-only Health action so users may place it manually, and show the same compact health state in relevant property inspectors. Do not add it to or alter the bundled profile. Press may cycle local diagnostic pages only; it must not open settings, mutate Codex, synthesize input, or contact external services.

## Test plan

- Exhaustive reason-code mapping tests for every source adapter.
- Transition logger test: repeated identical failure logs once; changed reason logs once.
- Privacy test with seeded titles, task IDs, prompts, paths, and URLs: none appear in normal logs/doctor JSON.
- `--include-paths` opt-in test is explicit and local only.
- Context fixtures differentiate missing, stale, unrelated-task, malformed, and ready data.
- Permission fixtures differentiate not exposed, Accessibility failure, and genuine pending/ready state.
- App-server canary test denies every mutating method and sends no turn/update request.
- Health action press test performs zero Codex/native mutation calls.
- Doctor exit-code tests for healthy, degraded, incompatible, and missing-install states.
- Full existing control and profile regression suite passes.

## Verification commands

```sh
npm run test:unit
npm run doctor
npm run doctor -- --json
npm run check
npm run build
npm run validate
```

On the installed plugin, temporarily remove foreground focus or deny a fixture’s Accessibility capability and confirm the reason changes immediately and recovers when restored. Do not change the user’s real permission settings solely for testing.

## Machine-checkable done criteria

- [ ] Core readers return `Availability<T>` or an equivalent reason-preserving type, not ambiguous `undefined`.
- [ ] Device labels map from stable reasons without exposing raw errors.
- [ ] Doctor reports exact build identity and component reasons.
- [ ] Default logs and doctor output contain no task IDs, titles, prompts, composer text, URLs, or full paths.
- [ ] Read-only app-server canary cannot invoke a mutating method.
- [ ] Optional Health action exists but bundled profile key count/mapping remains unchanged.
- [ ] Repeated unchanged failures do not spam logs.
- [ ] Full project and Elgato validation pass.

## STOP conditions

- A diagnostic requires reading or transmitting user content rather than metadata/state.
- A Codex app-server method’s mutability cannot be established from protocol behavior or authoritative documentation.
- Adding the action would alter the canonical bundled profile.
- A native error cannot be safely classified without exposing raw sensitive output; use `unavailable` and document the limitation.
- The doctor would require elevated permissions merely to report health.

## Maintenance notes

- Reason codes are a public diagnostic contract; add rather than silently repurpose them.
- Include doctor JSON and build SHA in future bug reports before collecting broader logs.
- Keep Health strictly observational. Repairs belong in explicit, separately authorized commands.
