# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas serve` opens the same scan as a web page at http://127.0.0.1:4173/: a list and a graph of
the skills, a live search and filters by agent, type, allowed tools and front matter, and each skill's front matter and content.

`…/tree/<commit>` scans a pinned commit, e.g. `./skill-atlas scan github.com/JetBrains/koog/tree/22e342e033c716f835312dd6cbe83193e1cbcf76`.

`https://github.com/<owner>` scans every repository of an organization or a user into one list, skipping
archived repositories and forks unless `--include-archived` / `--include-forks`; see [spec/organization.md](spec/organization.md).

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests; `npm run test:e2e` runs the
CLI on real repositories at pinned commits (network, `GITHUB_TOKEN`).

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
- [docs/demo/](docs/demo/README.md): short videos of the search and the organization scan.
