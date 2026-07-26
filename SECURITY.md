# Security Policy

## Supported versions

Security fixes are made against the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting feature on this repository:

1. Open the repository's **Security** tab.
2. Choose **Advisories**.
3. Select **Report a vulnerability**.

Include reproduction steps, affected versions, impact, and any suggested
mitigation. Do not attach Codex transcripts, rollout files, credentials, or
other private user data.

You should receive an initial response within seven days. A fix and disclosure
timeline will be coordinated based on severity and complexity.

## Scope

Particularly useful reports include:

- unintended writes to Codex state or configuration;
- credential or transcript exposure;
- unsafe command construction or arbitrary command execution;
- failure of push-to-talk key-release safeguards;
- actions operating on a different chat than the one shown;
- network communication that contradicts the documented local-only design.
