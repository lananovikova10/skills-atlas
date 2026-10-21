# Repository analysis
## Input
A **GitHub repository** URL, a local directory, or a GitHub **organization or user** URL:
every repository of it, see [organization.md](organization.md)
## Output
Every unique `SKILL.md`: **name**, **description**, **link**, **last updated**
## Architecture
Core: fetch → find → parse. CLI and [web view](web.md): *thin clients*.
Skill: id = `<owner>/<repo>:<path>`, name, description, commit, last updated
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory name
- Same names in different folders (e.g. .agents and .claude) should be treated as one skill and deduplicated = list only one time. 
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1

## What is a project skill?

A **skill file** is exactly `<root>/<dir>/SKILL.md`, where:
- `<root>` is one of, at the repository root only, in this canonical order:
  `.claude/skills`, `.agents/skills`, `.github/skills`, `agent/skills`
- `<dir>` is a single directory level (no nesting)
- The filename is case-sensitive: `skill.md` is not a skill

Anything else is not a skill, including the same layout in subdirectories
(e.g. `plugins/x/.claude/skills/…`).

### Not a skill → ignored
Every other file whose name is `skill.md` in any case is excluded and reported,
one stderr line each, with a reason. An ignored file is never read.
- `outside the skill roots`: product resources, test data, a `SKILL.md` at the
  repository root, nested roots such as `plugins/x/.claude/skills/…`
- `nested too deep in <root>`: `.claude/skills/a/b/SKILL.md`
- `directly in <root>, not in a skill directory`: `.claude/skills/SKILL.md`
- `not named SKILL.md`: wrong case, e.g. `.claude/skills/x/skill.md`

**Name**: front matter `name`, else `<dir>`.
A front matter `name` that differs from `<dir>` → warning, front matter wins.

**Identity**: one skill per name (case-insensitive) within a repository. The same name in several roots is one skill;
in two repositories of an organization scan, two skills.

**Canonical location**: when a skill has several files, the first in root
order above is used for the description and link. If the descriptions differ → warning.

## This repository's red-agent skill

The repository includes `.agents/skills/red-agent/SKILL.md` for exploratory testing of its web view.
Scanning this checkout lists one `red-agent` skill with its front matter description and a link to that file.
Its failing browser repros go under `tests/browser/red-agent/`, where the Playwright configuration discovers them.

## Last updated
**Last updated** = the commit date of the most recent commit, up to the scanned commit, that changed any
file in the skill's directory (`<root>/<dir>/`). Tested by `tests/last-updated.test.ts`.
- GitHub: `GET /repos/{owner}/{repo}/commits?path=<dir>&sha=<scanned commit>&per_page=1`, one request per
  skill file, at the same time as the files are read; the date is the commit's `committer.date`
- A local directory: `git -C <directory> log -1 --format='%H %cI' HEAD -- <dir>`
- A deduplicated skill: the latest date across all its files; its commit is the one of that date
- Not known (no git, a request that fails, a rate limit, no commit found) → a warning for that file, the scan
  goes on: `warning: <path>: last updated unknown: <reason>`, e.g. `not a git repository`. The other files of
  the skill still count; none known → the date is unknown
- An organization scan does not look them up: one more request per skill file in every repository
