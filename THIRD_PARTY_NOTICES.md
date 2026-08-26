# Third-party notices and research references

## Lucide icons

All pictograms are generated from `lucide-static` v1.31.0, under the ISC
License. Copyright © Lucide Contributors 2022; portions © Cole Bemis 2013–2022
under the MIT License.

## Barlow

The YEET and YOLO wordmarks are vector outlines generated from Barlow Condensed
Black Italic by Jeremy Tribby and contributors. Barlow is licensed under the
SIL Open Font License 1.1; the bundled license is at
`assets/fonts/barlow-condensed/OFL.txt`. The profile embeds only generated
letterform paths, so the result is a deterministic graphic and has no runtime
font dependency.

This project is an independent implementation. It does not contain source or
assets from the installed ChatGPT/Codex desktop application or Codex Micro.

The implementation was informed by these public projects:

- [Elgato Stream Deck SDK samples](https://github.com/elgatosf/streamdeck-plugin-samples)
  (MIT): action lifecycle, encoder feedback, custom profiles, packaging, and
  validation patterns.
- [ChatGato](https://github.com/marcoieni/chatgato) (MIT): confirmed that a
  credential-free companion can use Codex's local read-only SQLite index and
  rollout tails, documented deep links, and user-authorized keyboard automation.
- [AgentDeck](https://github.com/puritysb/AgentDeck) (MIT): thin-client design,
  useful offline states, encoder canvases, and Stream Deck Plus profile structure.
- [Codex Usage for Stream Deck Plus](https://github.com/Lucxar/elgato-streamdeck-codex-usage)
  (MIT): local-only privacy and security practices for a Codex companion.
- [Codex Deck](https://github.com/dazer1234/codex-stream-deck) (MIT): confirmed
  the practical six-agent plus command-page pattern, native down/up semantics,
  model-aware reasoning controls, and the importance of never distributing
  protected Codex keycap files.
- [ThreadDeck for Codex](https://github.com/y5862000/threaddeck-for-codex)
  (MIT): compared macOS push-to-talk lifecycle, conservative local-state
  handling, model-supported effort catalogs, profile recovery, and explicit
  compatibility boundaries.

No source files from those projects are vendored. The runtime dependency
`@elgato/streamdeck` and its transitive runtime dependencies are bundled by the
build. The installable plugin includes the complete applicable license texts in
`THIRD_PARTY_LICENSES.txt`, plus this project's MIT license in `LICENSE.txt`.
