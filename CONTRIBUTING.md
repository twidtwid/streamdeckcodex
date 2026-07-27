# Contributing

Thanks for helping improve Stream Deck Codex Companion.

## Before opening an issue

- Search existing issues first.
- Use the bug-report template for reproducible defects.
- Use the feature-request template for proposed behavior.
- Do not include Codex transcripts, local rollout data, credentials, account
  details, or private filesystem paths.

## Development setup

Requirements:

- macOS 13 or newer
- Node.js 24
- Stream Deck 7.1 or newer for connected-device testing

Install dependencies and run the automated gate:

```sh
npm ci
npm run check
```

Connected foreground QA is never a CI requirement. It requires an explicitly
marked disposable fixture, journals every mutation, and must restore the
original task state. The gate deliberately stops rather than claims success
until those facts can be independently verified (including reversible workflow,
New Chat, Send, Compact, and New Project paths). Read [QA.md](QA.md) before
running it:

```sh
npm run qa:dials
npm run qa:modes
npm run qa:design
npm run qa:keys:preflight -- --fixture "/path/to/disposable-fixture"
npm run qa:keys:connected -- --fixture "/path/to/disposable-fixture"
```

## Pull requests

- Keep each pull request focused.
- Add or update tests for behavior changes.
- Update the README or QA documentation when user-visible behavior changes.
- Run `npm run check` before submitting.
- Do not copy assets or source from the ChatGPT/Codex desktop application,
  Codex Micro, or third-party projects.
- Preserve the local-only, credential-free architecture.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
