# Project status

## Current phase

Public beta hardening. The control behavior is implemented and hardware-tested;
the current work is repository cleanup, process robustness, performance, and a
reproducible release gate.

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

## Next verified step

Run the complete local release gate, install the resulting working tree on the
Sagan test Mac, verify the attached Stream Deck Plus and visible Codex controls,
then push the release branch and require CI before tagging.

## Blockers

None currently known.
