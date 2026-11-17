# Security policy

## Reporting a vulnerability

Please report security problems privately, through [GitHub's private vulnerability reporting](https://github.com/gami-fied/gami.fied/security/advisories/new). Do not open a public issue, discussion or pull request for them.

A useful report says:

- which version or commit you tested, and how it was installed (Docker images, source, one-click template)
- what an attacker can do, and what they need first (an account, an API key, a player token, nothing)
- the steps or a small script that shows it.

## What happens next

- We acknowledge your report within **5 working days**.
- We confirm whether it is a vulnerability and agree how severe it is with you.
- We aim to release a fix within **30 days** for a serious problem, and sooner when it is being exploited.
- We publish a GitHub security advisory with the fix and credit you by name, unless you would rather not be named.

Please give us that time before talking about the problem in public.

## Supported versions

Fixes go into the latest minor release. Upgrade to it to get them.

| Version | Supported |
| :------ | :-------: |
| 1.3.x   |    Yes    |
| Earlier |    No     |

## In scope

- The API, worker and dashboard in this repository, and the published Docker images.
- The npm packages `@gami.fied/sdk`, `@gami.fied/react` and `@gami.fied/elements`.
- The install files: `docker-compose.yml`, the example environment files and the one-click templates.

## Out of scope

- The public demo's limits by design, such as the cap on how many demos run at once and the rate limit on starting them. Reaching another visitor's demo, or the server behind it, is in scope.
- Denial of service by sending a very large amount of traffic.
- Problems that need an attacker to already control the server, its database or its environment variables.
- A missing security header without a way to exploit it.
- Reports from automated scanners without a working example.

## Testing

Test only against an install you run yourself, or the public demo within its limits. Do not test against other people's installs, and do not access or change data that is not yours.

## More

[docs/security-audit.md](./docs/security-audit.md) lists what the automated tests cover, what has not been reviewed, and who can do what.
