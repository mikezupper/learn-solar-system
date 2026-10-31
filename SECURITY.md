# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, through
[GitHub's private vulnerability reporting](https://github.com/mikezupper/learn-solar-system/security/advisories/new),
and do not open a public issue. Include what you found, how to reproduce it, and what an attacker could do with it.

This is a small volunteer project, so response times are a goal and not a promise: an acknowledgment within a
week, and a fix or a plan soon after, depending on severity. You will be credited in the advisory unless you
prefer otherwise.

## What counts

The site is static, with no accounts and no personal data, so the main risks concern integrity and supply chain.

| In scope | Examples |
|---|---|
| Wrong numbers reaching a class through tampering | A way to make the page accept a tile whose hash does not match, or the worker accept a kernel that differs from its pin |
| Script injection | A crafted `?at=` value or catalog that runs code in the page |
| The build and the harness | A workflow that exposes the repository to a fork's code, or a dependency problem specific to how this project uses it |
| Leaks | A real hostname, a secret or personal data committed to this repository |

An honest error in the numbers, with no attacker involved, is not a security problem, but we still want to
hear about it: use the [accuracy report](https://github.com/mikezupper/learn-solar-system/issues/new?template=accuracy_report.yml).

The threat model is in [docs/SECURITY.md](docs/SECURITY.md).

## Supported versions

Only the `main` branch is supported. The project has no releases yet.
