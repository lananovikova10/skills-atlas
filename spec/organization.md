# Organization scan
`./skill-atlas scan https://github.com/<owner> [--include-archived] [--include-forks]`: every repository
of an organization or a user, in one combined list. `https://github.com/<owner>/<repo>` is a single
repository, as before ([cli.md](cli.md)). Tested by `tests/organization.test.ts` on a recorded GitHub.
## Input
- `github.com/<owner>`, with or without the scheme or a trailing slash; no repository part
- The owner is an organization or a user: `GET /users/<owner>` says which
- Owner not found → `Owner not found: https://github.com/<owner>`, exit code 1
## Which repositories
- Every page of `GET /orgs/<org>/repos?type=all` or `GET /users/<user>/repos?type=owner`, 100 a page,
  by full name: what the token can see; private ones only with a token that has access
- Each at its **default branch** head
- Skipped by default, and counted: **archived** (`--include-archived`), **forks** (`--include-forks`),
  **empty** (no commit: GitHub answers 409)
- A cap of **500** repositories: the rest are skipped, with
  `warning: more than 500 repositories: scanned the first 500, skipped <n>`
## Each repository
- The same skill definition as a single repository ([analysis.md](analysis.md))
- The root tree first, not recursive; only the skill roots it has are listed. A repository without
  any is one request
- **8** repositories at a time; one request fails its repository after 30 s
- Rate limits: a `403`/`429` with `retry-after`, or a spent budget (`x-ratelimit-remaining: 0`) that
  resets within a minute, is waited out and retried, up to 3 times. A later reset stops the scan:
  `warning: GitHub rate limit reached (resets at <hh:mm:ss> UTC); …; <n> of <k> repositories not scanned`
- Without `GITHUB_TOKEN`, first on stderr: `notice: without GITHUB_TOKEN GitHub allows 60 requests an hour, so the results may be incomplete; set GITHUB_TOKEN`
## Identity
- Skill id: `<owner>/<repo>:<path>`
- Deduplication stays **within a repository**: the same name in two repositories is two skills
- Each link pins **its own repository's** scanned commit
## Output
```
JetBrains · 115 skills in 498 repositories · 373 skipped · 3 warnings
add-dashboard-page · ij-perf-report-aggregator — Adds a dashboard page.
  https://github.com/JetBrains/ij-perf-report-aggregator/blob/<commit>/.claude/skills/…
```
- Header: `<owner> · N skills in K repositories · S skipped · W warnings`; K counts every repository
  scanned, with skills or not; S counts archived, forks, empty and over the cap
- Each skill: `<name> · <repository>`, then as in [cli.md](cli.md); sorted by name, then repository
- Repositories with no skills are not listed
- stderr: the warnings, then the `ignored:` lines, then `skipped: <n> archived (--include-archived), <n> forks (--include-forks), <n> empty, <n> over the cap`
  - A skill file's warning or ignored path: `<owner>/<repo>:<path>`
  - A failing repository (timeout, permission, a GitHub error): `warning: <owner>/<repo>: <message>`; the scan goes on
## Progress and cancelling
- In a terminal, one stderr line rewritten in place: `Scanning 37 / 140 repositories…`
- The core reports each repository's skills as it finishes (`onRepository`), for clients that stream
- Ctrl+C stops the scan: what was scanned so far is printed, with
  `warning: cancelled; <n> of <k> repositories not scanned`, exit code 130. A second Ctrl+C quits at once
## Exit code
- 0, also for partial results: failed repositories, the cap, the rate limit
- 1: the owner or the listing cannot be reached; 130: cancelled
