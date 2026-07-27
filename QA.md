# Release acceptance

This is the release gate for the connected Stream Deck Plus profile. A source
pass is necessary but not sufficient: release also requires exact installed
profile parity and evidence from all seven pages in the live Stream Deck editor.

## Automated gate

```sh
npm ci
npm run check
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

| Surface          | Required behavior                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page 1 agents    | Six ordered live sessions use the same compact labels and status palette as Dial 1. The focused session shows `NOW`; an empty slot shows `New chat / EMPTY SLOT` and opens a new chat.                                                                            |
| Page 1 sessions  | Six ordered live sessions, New Chat, and Plan Mode use the exact 50-key contract.                                                                                                                                                                                 |
| Page 2 controls  | FAST, Permissions, PTT, Quota, YEET, New Project, Compact, and Context appear once and remain legible at hardware size.                                                                                                                                           |
| Permissions      | Reads the focused Codex window's visible mode. Press performs one native read-cycle-verify transaction; `APPROVE → YOLO` must confirm and dismiss Codex's interactive Full Access dialog before the key redraws `YOLO`.                                           |
| Usage            | Defaults to weekly percentage left and compact reset time; press toggles to available resets without consuming one.                                                                                                                                               |
| Context          | Resolves only the focused primary task's fresh UTC-partitioned token snapshot. Press toggles remaining/exact views. Unknown is `CONTEXT / NO DATA` in both views.                                                                                                 |
| Pages 3–7        | Git & Delivery, Code Quality, Decisions, Workspace, and Codex Panels preserve every documented functional key; intentionally empty positions remain empty rather than becoming filler.                                                                            |
| Dials            | Agent, Action, Model, and Reasoning preserve selection-on-turn and apply-on-press semantics with visible feedback. Action cycles Fast, Plan, Compact, Review, Browser, Files, and Side chat; Reasoning labels `low` as `LIGHT` and never offers cache-only `MAX`. |
| Failure feedback | External failures never show success and always retain a readable failure state or `showAlert()`.                                                                                                                                                                 |

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
