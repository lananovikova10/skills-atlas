# Edge cases
Where skills live, and what is not a skill. The rules are in [analysis.md](analysis.md);
each case is tested on [../fixture](../fixture/) by `tests/scan.test.ts`, and on the real
repositories below by `tests/e2e/real-repositories.test.ts` (`npm run test:e2e`).

## Real repositories
Each one is pinned to a commit, so the expected output in `tests/e2e/expected/` never changes.

| Repository | Commit | Cases |
|---|---|---|
| JetBrains/MPS | `d7e4f5c1394535b05e90dde6e3e7e8a3f3e174a2` | 1: 42 skills in `.claude` and `.agents`, listed once; 3: product skills in `plugins/` are not copies; a tree too large for one answer |
| JetBrains/android | `6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765` | 2: `agent/skills`, the last commit with it; name ≠ directory (`write-evals`); a tree too large for one answer |
| JetBrains/koog | `22e342e033c716f835312dd6cbe83193e1cbcf76` | 3: test data in `integration-tests/…/skills` ignored |

Also tested on them: every link pins the commit; a full URL with a trailing slash is the same
pin; an unknown commit is a clear message and exit code 1.

## 1. Duplicates across roots
**Example**: a repository with the same skill in `.claude/skills/commits` and
`.agents/skills/commits`, one for each agent.

**Rule**: one skill per name, case-insensitive. The first file in root order
(`.claude`, `.agents`, `.github`, `agent`) is canonical: its link and description.
The others are its copies. Different descriptions → a warning.

**Output**:
```
commits — Write commit messages the way this repository does.
  <link to .claude/skills/commits/SKILL.md>
  also in .agents/skills/commits/SKILL.md, .github/skills/Commits/SKILL.md
```
stderr: `warning: .claude/skills/commits/SKILL.md: description differs in .github/skills/Commits/SKILL.md`

**Fixture**: `.claude/skills/commits`, `.agents/skills/commits` (same), `.github/skills/Commits` (other description).

## 2. Unusual root: `agent/skills`
**Example**: JetBrains/android keeps `agent/skills/writing-lint-checks`.

**Rule**: `agent/skills` is one of the four roots, last in root order.

**Output**: `writing-lint-checks` is listed, linked to `agent/skills/writing-lint-checks/SKILL.md`.

**Fixture**: `agent/skills/writing-lint-checks`.

## 3. Product skills and test data
**Example**: JetBrains/MPS ships `plugins/mcp-tools/resources/…/skills/mps-aspect-generator`
with the product; JetBrains/koog has `integration-tests/src/jvmTest/resources/skills/weather-retrieval`
as test data. Neither is a skill for working on the repository.

**Rule**: only `<root>/<dir>/SKILL.md` at the repository root is a skill. Every other
`skill.md` in any case is ignored, never read, and reported on stderr with a reason.

**Output**: not listed; stderr, after the warnings, sorted by path:
```
ignored: .claude/skills/group/inner/SKILL.md: nested too deep in .claude/skills
ignored: .claude/skills/lowercase/skill.md: not named SKILL.md
ignored: integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md: outside the skill roots
ignored: plugins/mcp-tools/resources/skills/mps-aspect-generator/SKILL.md: outside the skill roots
ignored: plugins/x/.claude/skills/nested/SKILL.md: outside the skill roots
```

**Fixture**: `plugins/mcp-tools/…/mps-aspect-generator` (product),
`integration-tests/…/weather-retrieval` (test data), `plugins/x/.claude/skills/nested` (nested root),
`.claude/skills/group/inner` (too deep), `.claude/skills/lowercase/skill.md` (case).

## Name ≠ directory
**Rule**: the front matter `name` wins, with a warning.

**Output**: `code-review`, linked to `.claude/skills/reviewer/SKILL.md`; stderr:
`warning: .claude/skills/reviewer/SKILL.md: name "code-review" differs from its directory "reviewer"; using "code-review"`

**Fixture**: `.claude/skills/reviewer`.
