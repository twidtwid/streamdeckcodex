# Release acceptance

This is the release gate for the connected Stream Deck Plus profile. A source
pass is necessary but not sufficient: release also requires exact installed
profile parity and evidence from all seven pages in the live Stream Deck editor.

## Automated gate

```sh
npm ci
npm run audit:full
npm run audit:production
npm run check
npm run docs:check
```

`npm run check` verifies formatting, types, tests, the complete 144px/72px
visual atlas, the design evaluator, the production build, and Elgato manifest
validation.

The design evaluator rejects:

- missing, inert, unregistered, or misleading key actions;
- redundant copy, dirty metadata, banned navigation, and wrong page grouping;
- duplicate labels, icon aliases, or underlying Lucide path data;
- missing YOLO/YEET primary contracts or duplicate Usage/Context keys;
- edge collisions, icon/caption overlap, ellipses, and weak glyph mass;
- installed page names, key counts, mappings, or settings that differ from
  source.

## Physical input matrix

| Surface          | Required behavior                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page 1 agents    | Six ordered live sessions use the same compact labels and status palette as Dial 1. The focused session shows `NOW`; an empty slot shows `New chat / EMPTY SLOT` and opens a new chat.                                                                                                                                                                     |
| Page 1 sessions  | Six ordered live sessions, New Chat, and Plan Mode use the exact 50-key contract.                                                                                                                                                                                                                                                                          |
| Page 2 controls  | FAST, Permissions, PTT, Quota, YEET, New Project, Compact, and Context appear once and remain legible at hardware size.                                                                                                                                                                                                                                    |
| Permissions      | Reads the focused Codex window's visible mode. Press performs one native read-cycle-verify transaction; `APPROVE → YOLO` must confirm and dismiss Codex's interactive Full Access dialog before the key redraws `YOLO`.                                                                                                                                    |
| Usage            | Defaults to weekly percentage left and compact reset time; press toggles to available resets without consuming one.                                                                                                                                                                                                                                        |
| Context          | Resolves only the focused primary task's fresh UTC-partitioned token snapshot. Press toggles remaining/exact views. Unknown is `CONTEXT / NO DATA` in both views.                                                                                                                                                                                          |
| Pages 3–7        | Git & Delivery, Code Quality, Decisions, Workspace, and Codex Panels preserve every documented functional key; intentionally empty positions remain empty rather than becoming filler.                                                                                                                                                                     |
| Dials            | Agent, Action, Model, and Reasoning preserve selection-on-turn and one-apply-on-press semantics with visible feedback. Rotation performs zero Codex mutations. Model families and Reasoning values come from the active model catalog; `none`/`minimal` are supported, cache-only `MAX` is excluded, and Ultra appears only when that model advertises it. |
| Health           | The optional action and `npm run doctor` are read-only. They expose bounded reason codes and build identity without changing the canonical profile or logging task content.                                                                                                                                                                                |
| Failure feedback | External failures never show success and always retain a readable failure state or `showAlert()`.                                                                                                                                                                                                                                                          |

## Connected release gate

If the profile still has six pages, create Page 7 once with Stream Deck's
**Add Page** control. Then close Stream Deck before installing so its cached
profile cannot overwrite the new manifests:

```sh
npm run profile:keycaps:install -- "/path/to/Active.sdProfile"
```

After relaunch:

1. Select pages 1 through 7 in the Stream Deck editor.
2. Save full-window screenshots as `page-1.png` through `page-7.png`.
3. Run the release evaluator:

```sh
node scripts/evaluate-profile-design.mjs \
  --release \
  --installed "/path/to/Active.sdProfile" \
  --live-pages ".cache/live-profile-pages"
```

Release passes only if installed manifests match source, all seven live grids are
distinct, and macOS Vision OCR finds page-specific labels—including YOLO and
YEET on Page 2.

Connected foreground QA requires an explicitly marked disposable fixture and
must restore state before it can report success. Never run it against a
personal project or existing draft. The current command is fail-closed while
the foreground verifier lacks an independent empty-composer and cleanup
witness; a STOP result is not connected release evidence:

- workflow and New Chat do not expose cleanup-capable task identities;
- Send and Compact have no inverse operation;
- New Project has no verified picker-dismiss cleanup; and
- preflight cannot independently verify permissions, the foreground fixture
  task, or an empty composer without a safe read-only witness.

```sh
npm run qa:dials
npm run qa:modes
npm run qa:keys:preflight -- --fixture "/path/to/disposable-fixture"
npm run qa:keys:connected -- --fixture "/path/to/disposable-fixture"
```

`qa:dials` is a separate reversible connected event-path gate for Model and
Reasoning. It requires the exact frontmost task and an empty composer; records
zero mutation on rotation, one targeted mutation on press, verifies the visible
picker, and restores the original model/effort. It does not simulate a human
turning the physical encoder, so physical-device evidence must still be observed
on the installed build. A connected pass must record plugin SHA, Codex version,
Stream Deck version, date, postcondition, and restoration result.

The 2026-09-01 Sagan gate used Stream Deck 7.5.1, Node 24.13.1, Codex desktop
26.715.72359, and an attached Stream Deck Plus. The profile rendered normally.
The live adapter visibly changed 5.6 Sol/High to 5.6 Terra/Light. The separate
action-event gate exercised Model, Reasoning, and Plan, then restored
Terra/Light with Plan off. Rotation was preview-only and press applied once.
The follow-up gate also toggled Plan and Fast on then off with one task-bound
dispatch per press. Terra's live Ultra confirmation used the bounded Continue
button, read back Ultra, and restored Light without enabling Full access.
This is registered-action plus visible-UI evidence, not a claim that a human
physically turned every encoder.

Current Codex exposes compact picker state in the popup title and Model/Effort
inside **Show advanced options**. Empty composers may expose `Do anything` or
the Plan hint through AXValue rather than AXPlaceholderValue. The native gate
has compiled fixtures for these placeholders, traverses the advanced picker,
uses semantic AXPress for the final selection, and still rejects arbitrary
draft text.

The complete non-connected release gate is `npm run release:verify`. It does
not claim physical-device success. Run `npm run release:verify:connected` only
with explicit connected QA intent and the required disposable fixture.
