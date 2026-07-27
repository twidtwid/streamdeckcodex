# Plan 006 — Direct Workspace Surface Keys

## Goal

Add Browser, Files, and Side chat as physical Stream Deck keys while retaining
their Dial 2 entries and every existing key. Pages 1 and 2 remain unchanged.

## Page 6 — Workspace

| Position | Label       | Action              |
| -------- | ----------- | ------------------- |
| `0,0`    | Run shell   | `workflow:terminal` |
| `1,0`    | Edit code   | `workflow:editor`   |
| `2,0`    | Debug       | `workflow:debug`    |
| `3,0`    | Upload file | `workflow:upload`   |
| `0,1`    | Skills      | `skills`            |
| `1,1`    | Chat audit  | `workflow:sessions` |

## Page 7 — Codex Panels

| Position | Label     | Action              |
| -------- | --------- | ------------------- |
| `0,0`    | Browser   | `command:browser`   |
| `1,0`    | Files     | `command:files`     |
| `2,0`    | Side chat | `command:side-chat` |
| `3,0`    | Sidebar   | `command:sidebar`   |
| `0,1`    | Settings  | `command:settings`  |

## Verification

1. Regenerate the five curated keycap pages from the source generator.
2. Assert all 51 literal page/position/action rows through real handlers.
3. Assert the three direct command IDs explicitly.
4. Render and inspect all 51 keys at 144×144 and physical 72×72.
5. Pass format, typecheck, unit tests, design evaluation, build, and Elgato
   validation.
6. Create Page 7 once through Stream Deck's native Add Page control, install all
   seven page contents with Stream Deck closed, restart it, and verify the
   plugin remains connected without runtime errors. Never synthesize an
   unregistered installed page directory.

## Result

Completed on 2026-07-26. The source and installed profiles contain seven pages
and 51 keys; all 329 tests, the 144px/72px visual evaluator, the production
build, and Elgato validation pass. The installed plugin survived restart and
the Page 2 Permissions key completed the interactive `APPROVE → YOLO` Full
Access confirmation flow with a verified live redraw.
