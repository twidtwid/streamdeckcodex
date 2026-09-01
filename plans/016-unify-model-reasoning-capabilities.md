# Plan 016: Unify dynamic Model and Reasoning capabilities end to end

**Status:** BLOCKED — implementation passes; connected mutation/restoration cannot run in the background  
**Priority:** P1  
**Effort:** M  
**Risk:** Medium  
**Depends on:** Plans 013 and 015  
**Target baseline:** canonical public descendant with truthful dial event-path QA

## Why

TypeScript discovers model families dynamically, while the native Swift helper uses exact hard-coded `gpt-5.6-*` labels. TypeScript accepts `none` and `minimal`, while Swift’s effort labels omit them. Reasoning fallback can also combine capabilities from unrelated models and reinsert a persisted unsupported value. This creates a split-brain UI: the dial may display or preview a value that the native layer cannot locate or safely apply.

## Current state and evidence

- `src/lib/model.ts` accepts cached slugs ending in Luna, Terra, or Sol.
- The Swift helper contains exact versioned `modelLabels` entries for `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`.
- `src/lib/reasoning.ts` normalizes `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `ultra`.
- Swift’s `effortLabels` omits `none` and `minimal`.
- `reasoningSnapshot()` may reinsert the persisted current effort, and missing active-model capability can fall back to a union of all models.
- The local `models_cache.json` provides authoritative per-model `slug`, `display_name`, `default_reasoning_level`, and `supported_reasoning_levels` data.

## Drift check

```sh
git status --short
git rev-parse HEAD
rg -n "modelLabels|effortLabels|supported_reasoning_levels|supportedReasoningLevels|reasoningSnapshot" src native
```

Expected: duplicated hard-coded capability maps or unsafe union/reinsert behavior remains. If the Codex cache schema changed, stop and update fixtures before implementation.

## Scope

- Introduce one typed capability snapshot derived from current Codex model metadata.
- Carry validated display/selection data from TypeScript to the native adapter.
- Support future Luna/Terra/Sol version slugs without exact version maps.
- Offer only reasoning values supported by the selected/current model.
- Distinguish a reported-but-unsupported current value from selectable values.
- Fail closed for unknown models, missing metadata, stale capability data, or unverified UI aliases.

## Out of scope

- Supporting non-Codex providers or arbitrary model families.
- Inventing Ultra support when the selected model/account does not advertise it.
- Editing Codex configuration files or model cache.
- Broad Swift modularization; keep refactoring limited to the capability boundary.

## Git workflow

Create `codex/016-dynamic-capabilities` from the completed Plan 015 commit. Commit schema/fixtures first, then TypeScript/native integration, then device QA evidence documentation.

## Implementation steps

### 1. Define a versioned capability contract

Add a typed structure similar to:

```ts
type CapabilitySnapshot = {
  schemaVersion: 1;
  observedAt: number;
  model: {
    slug: string;
    displayName: string;
    family: "luna" | "terra" | "sol";
  };
  defaultReasoning: ReasoningLevel;
  supportedReasoning: ReasoningLevel[];
};
```

The implementation may vary, but it must preserve authoritative slug/display name, an allow-listed family, ordered supported efforts, source freshness, and schema version.

### 2. Parse and validate current Codex metadata once

Use one parser for `models_cache.json`. Validate:

- bounded string lengths and characters;
- unique model slugs;
- recognized Luna/Terra/Sol family suffix;
- recognized reasoning enum values;
- nonempty supported-effort list for selectable models;
- cache freshness according to a documented threshold.

Unknown fields are ignored; malformed entries are excluded with a structured diagnostic reason. Never mutate the cache.

### 3. Remove divergent native exact-version maps

Pass the validated active/selected model display alias and effort label to the Swift helper through a bounded structured payload. Swift must independently validate schema, family, lengths, characters, and effort enum before UI interaction. It must not trust arbitrary Accessibility labels from callers.

Keep a small allow-listed normalization map for known effort UI labels (`None`, `Minimal`, `Low`, `Medium`, `High`, `X High`, `Ultra`) if the visible Codex UI requires it; this map is semantic, not model-version-specific.

### 4. Make selection fail closed

- Unknown active model: no model-specific reasoning options; display `UNSUPPORTED`/diagnostic reason.
- Missing capability metadata: do not use a union across other models.
- Persisted unsupported current effort: show it as reported current if needed, but keep it out of the selectable/dispatch list.
- Ultra: selectable only when present in the selected model’s supported list.
- Changing pending model: immediately recompute its pending reasoning choices without dispatching either value.

### 5. Verify visible postconditions

After native apply, read the visible Codex model/reasoning control and compare normalized authoritative values. A label mismatch or unavailable control is a failure, not success. Use the exact event-path and restore flow from Plan 015.

## Test plan

- Parser fixtures for current cache shape and unknown additive fields.
- Future slug fixtures such as a later `gpt-*-terra` version resolve to Terra without code changes.
- `none` and `minimal` round-trip through TypeScript/native normalization.
- Luna fixture does not offer or dispatch Ultra when absent.
- Sol fixture offers Ultra only when advertised.
- Unknown model yields no cross-model union fallback.
- Stale/malformed cache yields explicit unavailable state.
- Persisted unsupported effort is visible as reported current but never selectable.
- Structured-payload fuzz tests reject shell metacharacters, control characters, oversized labels, unknown families, and unknown effort values.
- Connected Model and Reasoning change/restore tests from Plan 015 pass after reload.

## Verification commands

```sh
npm run test:unit
npm run native:fixtures
npm run typecheck
npm run build
npm run validate
npm run check
STREAMDECK_CONNECTED_QA=1 npm run qa:dial-events:connected
```

Expected: fixtures cover every supported effort, future versioned slugs, unknown/stale data, and Ultra exclusion; connected verification changes and restores the visible task.

## Machine-checkable done criteria

- [ ] There is one authoritative TypeScript capability parser and no exact `gpt-5.6-*` native selection table.
- [ ] Native payload validation rejects unknown family/effort and unsafe strings.
- [ ] Unknown active model produces zero selectable reasoning mutations.
- [ ] No reasoning union fallback across unrelated models remains.
- [ ] Unsupported persisted values cannot be dispatched.
- [ ] Ultra is offered only when advertised by the selected model.
- [ ] Connected event-path QA passes for a reversible Model and Reasoning change and restoration.

## STOP conditions

- The current Codex metadata no longer exposes per-model supported efforts.
- Visible Codex labels cannot be mapped from validated metadata without an ambiguous generic chooser.
- Capability freshness cannot be determined safely.
- Connected restoration fails or the visible task has a draft.
- Supporting a new family would require accepting arbitrary unvalidated UI text.

## Maintenance notes

- Add fixtures whenever Codex changes the cache schema or effort vocabulary.
- The UI must always reflect capability data for the selected model, not the account-wide union.
- Keep aliases narrow and semantic; do not reintroduce version-specific native maps.
