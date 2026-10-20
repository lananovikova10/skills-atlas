# fixture

A small repository for the tests. The cases are in [../spec/edge-cases.md](../spec/edge-cases.md).

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.agents/skills/commits` | the same skill in another root: a copy |
| `.github/skills/Commits` | the same name in another case, another description: a copy and a warning |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `agent/skills/writing-lint-checks` | the `agent/skills` root |
| `.claude/skills/reviewer` | front matter `name: code-review` ≠ directory: a warning |
| `plugins/mcp-tools/resources/skills/mps-aspect-generator` | a product skill: ignored |
| `integration-tests/src/jvmTest/resources/skills/weather-retrieval` | test data: ignored |
| `plugins/x/.claude/skills/nested` | a skill root in a subdirectory: ignored |
| `.claude/skills/group/inner` | nested too deep: ignored |
| `.claude/skills/lowercase/skill.md` | not named `SKILL.md`: ignored |
