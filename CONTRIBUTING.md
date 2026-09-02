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
- Node.js 24 (the plugin runs on Stream Deck's embedded Node 24)
- Xcode command-line tools, for `swiftc`
- librsvg and ImageMagick (`brew install librsvg imagemagick`), for visual QA
- Stream Deck 7.1 or newer for connected-device testing

Install dependencies and run the automated gate:

```sh
npm ci
npm run check
```

Useful loops:

```sh
npm run test:fast              # unit tests only, no native helper needed
npm test                       # builds the native helper, then every test
npx vitest run test/<name>.test.ts
```

The compiled-native fixture tests (`test/native-*.test.ts` and the acceptance
files) call `bin/codex-ui-control` with `--*-fixture` flags; they need the
helper built by `npm run native:build`, which `npm test` runs for you.

Keys live in one place: `profile-src/profile-contract.json`. Adding, moving,
or relabeling a key means editing the contract and running
`npm run profile:generate` so every device profile is regenerated; `check`
fails if the generated sources are stale.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing chat targeting, native
Accessibility control, app-server transport, refresh scheduling, or process
cleanup. Those boundaries carry the project's fail-closed guarantees.

Connected foreground QA is never a CI requirement. It requires an explicitly
marked disposable fixture, journals every mutation, and must restore the
original task state. Read [QA.md](QA.md) before running it.

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
