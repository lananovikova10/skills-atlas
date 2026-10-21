# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description, link and when it was last updated.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
  updated 2026-08-25
…
```

`./skill-atlas serve` opens the same scan as a web page at http://127.0.0.1:4173/: a list and a graph of
the skills, a live search and filters by agent, type, allowed tools and front matter, a sort by name or last update,
and each skill's front matter and content.
The **Map** places the skills by what they say they do, in topics, with a tiny model (Model2Vec's potion-base-8M,
30 MB, downloaded from Hugging Face when the map is opened) that runs in the page; see [spec/web.md](spec/web.md#map).

`…/tree/<commit>` scans a pinned commit, e.g. `./skill-atlas scan github.com/JetBrains/koog/tree/22e342e033c716f835312dd6cbe83193e1cbcf76`.

`https://github.com/<owner>` scans every repository of an organization or a user into one list, skipping
archived repositories and forks unless `--include-archived` / `--include-forks`; see [spec/organization.md](spec/organization.md).

Set `GITHUB_TOKEN` for a higher GitHub rate limit; in the web view, and on the standalone page, the
**GitHub token** field does the same, for that page only. `npm test` runs the tests; `npm run test:e2e` runs the
CLI on real repositories at pinned commits (network, `GITHUB_TOKEN`); `npm run e2e` plays the
search demo in Chromium on recorded data, compares the page to its screenshots to the pixel and records a
video of every run in `test-results/`. The screenshots match only in the Playwright image CI uses, never on
a Mac, so run it there (the second `-v` keeps the Linux `node_modules` out of yours):

```
docker run --rm -it --platform linux/amd64 -v "$PWD":/work -v /work/node_modules -w /work --ipc=host \
  mcr.microsoft.com/playwright:v1.64.1-noble bash -c "npm ci && npm run e2e"
```

A change to the page changes its screenshots: `npm run e2e:update` in the same command writes new ones, or
run Actions → **update-baselines** on the branch, which commits them. The image's version is the one of
`@playwright/test` in `package.json`: move them together.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
- [docs/demo/](docs/demo/README.md): short videos of the skill list, the search, the map and the organization scan.
