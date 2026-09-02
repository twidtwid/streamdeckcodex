# Project status

## Current phase

Public beta hardening. PR #18 passed CI; the final connected-device findings are
being added and reverified before merge.

## Completed

- Implemented the full key, touch-strip, and dial profile for supported Stream
  Deck models, including live sessions, status colors, workflows, usage,
  context, permissions, PTT, model, reasoning, Plan, and FAST.
- Replaced blind input paths with exact visible-chat targeting, draft guards,
  verified Accessibility postconditions, and idempotent input cleanup.
- Added generated profile parity, hardware-size visual checks, compiled-native
  fixtures, registered event-path acceptance tests, dependency audits, doctor
  diagnostics, and Elgato validation.
- Consolidated child-process handling behind bounded output, timeouts,
  TERM/KILL escalation, and confirmed reap behavior.
- Split the native helper into targeting, Accessibility, composer controls,
  models, fixtures, and CLI dispatch modules.
- Consolidated the connected dial/mode test transport and removed obsolete QA
  scripts.
- Reduced background native work with a 2.5-second composer cache and
  incremental activity-witness reads while keeping immediate action checks.
- Moved live dashboard activity under ignored `.cache/` runtime storage and
  removed the duplicate build from the package step.
- Passed the connected registered-action gates on an attached Stream Deck Plus:
  Model and Reasoning rotation caused no mutation, each press applied once,
  PTT started and stopped with verified feedback, Plan and FAST toggled both
  directions, and the original Terra/High with both modes off was restored.
- Fixed two issues found only by the connected gate: the mode-QA proxy now uses
  Stream Deck's embedded Node runtime, and the verified FAST transaction has a
  12-second bridge timeout instead of the insufficient generic 5 seconds.

## Next verified step

Run the complete release gate for the connected-QA follow-up, install the exact
clean build on the test Mac, update PR #18, and require CI again before merge.

## Blockers

Merging and tagging require explicit protected-main approval.
