# Release acceptance

This is the release gate for the connected Stream Deck Plus profile. A source
pass is necessary but not sufficient: release also requires exact installed
profile parity and evidence from all six pages in the live Stream Deck editor.

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

| Surface          | Required behavior                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page 1 agents    | Six ordered live sessions use the same compact labels and status palette as Dial 1. The focused session shows `NOW`; an empty slot shows `New chat / EMPTY SLOT` and opens a new chat. |
| Page 1 YOLO      | Displays the outlined `YOLO / AUTONOMOUS` wordmark and dispatches exactly `workflow:yolo`.                                                                                             |
| Page 1 YEET      | Displays the outlined `YEET / PUBLISH` wordmark and dispatches exactly `workflow:publish`.                                                                                             |
| Page 2 core      | New Chat, Plan Mode, Push to Talk, Usage, PR Review, Debug, Compact, and Context appear once and remain legible at hardware size.                                                      |
| Usage            | Defaults to weekly percentage left and compact reset time; press toggles to available resets without consuming one.                                                                    |
| Context          | Resolves only the focused primary task's fresh UTC-partitioned token snapshot. Press toggles remaining/exact views. Unknown is `CONTEXT / NO DATA` in both views.                      |
| Pages 3–6        | Git & Delivery, Code Quality, Decisions, and Workspace each contain the exact eight documented functional keys with no fillers.                                                        |
| Dials            | Agent, Action, Model, and Reasoning preserve selection-on-turn and apply-on-press semantics with visible feedback.                                                                     |
| Failure feedback | External failures never show success and always retain a readable failure state or `showAlert()`.                                                                                      |

## Connected release gate

Close Stream Deck before installing so its cached profile cannot overwrite the
new manifests:

```sh
npm run profile:keycaps:install -- "/path/to/Active.sdProfile"
```

After relaunch:

1. Select pages 1 through 6 in the Stream Deck editor.
2. Save full-window screenshots as `page-1.png` through `page-6.png`.
3. Run the release evaluator:

```sh
node scripts/evaluate-profile-design.mjs \
  --release \
  --installed "/path/to/Active.sdProfile" \
  --live-pages ".cache/live-profile-pages"
```

Release passes only if installed manifests match source, all six live grids are
distinct, and macOS Vision OCR finds page-specific labels—including YOLO and
YEET on page 1.

Connected dial and mode checks can change the visible state of an idle Codex
task:

```sh
npm run qa:dials
npm run qa:modes
```
