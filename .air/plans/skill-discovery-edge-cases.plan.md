# Skill discovery edge cases: duplicates, unusual roots, product/test-data skills

## Context
Your draft in `spec/analysis.md` ("What is a project skill?") already sets the rules. The code doesn't follow them yet:
- `src/core/find.ts:11-16` accepts **every** file named `SKILL.md` anywhere, so product skills (`plugins/mcp-tools/resources/…/skills/mps-aspect-generator`) and test data (`integration-tests/src/jvmTest/resources/skills/weather-retrieval`) appear as skills.
- `copies` is always `[]`, so the same skill in `.claude/skills` and `.agents/skills` appears twice. The `also in …` output (`src/commands.ts:48`, `spec/cli.md`) is already built but never shows.
- `SKILL_ROOTS` (`src/core/find.ts:5`) puts `.agents` first, but the spec's canonical order puts `.claude` first.
- Nothing records what was excluded.

Case-by-case status:

| Case | Status | Fix |
|---|---|---|
| 1. Duplicates across roots | not handled | merge by name after parsing |
| 2. `agent/skills` (JetBrains/android) | already in `SKILL_ROOTS`, no test | fixture + test |
| 3. Product / test-data skills | wrongly listed | filter by root rule, log as `ignored:` |

## Approach
`find` classifies paths and has no I/O. A path is a skill file only if it is exactly `<root>/<dir>/SKILL.md` and `<root>` is one of the four root-level roots. Every other `SKILL.md`-like file becomes an **ignored** entry with a reason. Deduplication happens in `scan` after parsing, because the identity (the front matter `name`) is known only then. Ignored files go to stderr as `ignored: <path>: <reason>` lines, separate from `warning:` lines: they are expected, not problems, and stdout stays only the atlas.

## File changes
- **Modify** `src/core/find.ts`: reorder `SKILL_ROOTS` to `.claude, .agents, .github, agent`. `findSkills(paths)` returns `{ files: SkillFile[]; ignored: Ignored[] }`.
  - `SkillFile = { path; directory; rootIndex }`
  - `Ignored = { path; reason }`
- **Modify** `src/core/scan.ts`: group parsed skills by name, pick the canonical one, fill `copies`, add warnings, add `ignored` to `ScanResult`.
- **Modify** `src/commands.ts:35-40`: after the warnings, print `ignored: <path>: <reason>` to stderr.
- **Modify** `src/core/model.ts`: no shape change. `copies` is now filled in (update the doc comment).
- **Modify** `spec/analysis.md`, `spec/cli.md`, fill in `spec/edge-cases.md`.
- **Modify** `fixture/README.md` and add the fixture files below.
- **Modify** `tests/scan.test.ts` and `tests/helpers.ts`.

## Implementation steps

### Task 1: Spec first (AGENTS.md)
1. `spec/analysis.md`:
   - Fix the root list to the canonical order (it already says `.claude, .agents, .github, agent`).
   - Add a section **Not a skill → ignored**: every other file whose name is `skill.md` in any case is excluded and reported, one stderr line each, with a reason:
     - `outside the skill roots`: product resources, test data, nested roots such as `plugins/x/.claude/skills/…`
     - `nested too deep`: `.claude/skills/a/b/SKILL.md`
     - `not named SKILL.md`: wrong case
   - Fix the typo "case-insensitive).The".
2. `spec/cli.md`: add "`ignored: <path>: <reason>` lines go to *stderr*, after the warnings, sorted by path". Spell out the warning texts for a name mismatch and for differing descriptions.
3. `spec/edge-cases.md`: replace the draft notes with the 3 cases. For each: an example repo, the rule, the expected output, and the fixture path that tests it.

### Task 2: Classification in `find.ts`
4. For each path whose basename lowercased is `skill.md`:
   - If the basename isn't exactly `SKILL.md` → ignored, `not named SKILL.md`.
   - Else, if the path starts with `<root>/` for some root:
     - remainder is `<dir>/SKILL.md` → skill file with that root's `rootIndex`;
     - deeper → ignored, `nested too deep in <root>`.
   - Else → ignored, `outside the skill roots`.
   
   Sort files by `(rootIndex, path)` and ignored entries by path. The old fallback that named a root-level `SKILL.md` after the repository goes away: a root `SKILL.md` is now ignored, `outside the skill roots`. Drop the `repositoryName` parameter.

### Task 3: Dedup in `scan.ts`
5. Read and parse every file, as now with `Promise.all`. Resolved name = front matter `name` ?? `directory`. If a front matter name differs from `directory`, warn: `<path>: name "<x>" differs from its directory "<dir>"; using "<x>"`.
6. Group by `name.toLowerCase()`, keeping the `(rootIndex, path)` order. The first readable file is canonical: its path, name and description. `copies` is the other paths. If any copy's description differs from the canonical one, warn: `<canonical path>: description differs in <copy paths>`.
7. Unreadable files keep today's warning (`scan.ts:32`) and are not used as canonical.
8. `ScanResult` adds `ignored: Ignored[]`.

### Task 4: Output
9. `src/commands.ts` `scanCommand`: after the warning loop, `for (const item of result.ignored) context.error(\`ignored: ${item.path}: ${item.reason}\`)`. The header count is the number of unique skills.

### Task 5: Fixture + tests (one test per spec case)
10. Add the fixture files:
    - `fixture/.agents/skills/commits/SKILL.md`: same name and description as the `.claude` one → one skill, `also in`.
    - `fixture/.github/skills/Commits/SKILL.md`: name `commits`, different description → merged case-insensitively, warning about the differing description.
    - `fixture/agent/skills/writing-lint-checks/SKILL.md` → listed (case 2).
    - `fixture/.claude/skills/reviewer/SKILL.md` with `name: code-review` → name mismatch warning.
    - `fixture/plugins/mcp-tools/resources/skills/mps-aspect-generator/SKILL.md` → ignored (product).
    - `fixture/integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md` → ignored (test data).
    - `fixture/plugins/x/.claude/skills/nested/SKILL.md` → ignored (nested root).
    - `fixture/.claude/skills/group/inner/SKILL.md` → ignored (too deep).
    - `fixture/.claude/skills/lowercase/skill.md` → ignored (case).
    
    Update the `fixture/README.md` table.
11. `tests/scan.test.ts`:
    - Update the fixture stdout expectation:
      - `commits` once, with `also in .agents/skills/commits/SKILL.md, .github/skills/Commits/SKILL.md`
      - `writing-lint-checks` from `agent/skills`
      - `code-review` from `reviewer`
      - the header count updated to match
    - Add focused tests that assert stderr lines:
      - "duplicate across roots → listed once, canonical `.claude`, copies"
      - "differing descriptions → warning"
      - "`agent/skills` is a root"
      - "product resources / test data / nested / too deep / wrong case → not listed, one `ignored:` line each with reason"
      - "front matter name ≠ directory → warning, front matter wins"
    - Add a unit-level test of `findSkills` for root-level-only matching. Example: `docs/.claude/skills/x/SKILL.md` is ignored.
12. `tests/helpers.ts`: add one more code-search result to the `EXAMPLE` recording, `src/test/resources/skills/weather/SKILL.md`, with no raw recording, since it must never be read. This shows the GitHub path also ignores it. Assert in the example test that `stderr` is `ignored: src/test/resources/skills/weather/SKILL.md: outside the skill roots`. The existing stdout assertion stays unchanged.
13. Update the test file header comment, which still says "edge cases … are yours to add".

## Acceptance criteria
- `./skill-atlas scan ./fixture` exits 0. stdout lists each unique name exactly once: `code-review, code-style, commits, release-checklist, writing-lint-checks` (5 skills). `commits` links to `.claude/skills/commits/SKILL.md` and prints `also in` with both copies.
- stderr contains exactly 5 `ignored:` lines, one for each non-skill fixture file, each with its reason. It also has the warnings for malformed front matter, the differing description and the name mismatch.
- No `ignored` file is read: the GitHub replay has no raw recording for it and the scan still succeeds.
- `npm run typecheck` and `npm test` pass. The CI smoke step (`.github/workflows/ci.yml`) still exits 0.

## Verification
- `npm ci && npm run typecheck && npm test`
- `./skill-atlas scan ./fixture`: check stdout and stderr by eye.
- Optional live check with `GITHUB_TOKEN`: `./skill-atlas scan https://github.com/JetBrains/koog` should show `weather-retrieval` only as `ignored:`. `JetBrains/MPS` should show `mps-aspect-generator` as ignored. `JetBrains/android` should list `writing-lint-checks`.

## Risks & mitigations
- **Real skills in roots we don't know yet get hidden.** They aren't lost: every `SKILL.md` outside the roots is printed as `ignored:`, so new roots are easy to spot and add to `SKILL_ROOTS` and the spec.
- **Noisy stderr on huge repos with token search,** for example many test fixtures in intellij-community. Accepted for now, since one line per file is what was asked. A count summary can be added later if it gets annoying.
- **Without a token on a truncated tree, only the roots are listed,** so ignored files outside them aren't seen. The existing warning (`src/core/github.ts:65`) already explains this. No change.
- **Changing the root order changes which copy is canonical** for existing users (`.claude` before `.agents`). This is intended per the spec.
