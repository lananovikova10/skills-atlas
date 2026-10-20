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

`…/tree/<commit>` scans a pinned commit, e.g. `./skill-atlas scan github.com/JetBrains/koog/tree/22e342e033c716f835312dd6cbe83193e1cbcf76`.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests; `npm run test:e2e` runs the
CLI on real repositories at pinned commits (network, `GITHUB_TOKEN`).

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
