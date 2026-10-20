# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every unique `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
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

**Identity**: one skill per name (case-insensitive). The same name in several roots is one skill.

**Canonical location**: when a skill has several files, the first in root
order above is used for the description and link. If the descriptions differ → warning.
