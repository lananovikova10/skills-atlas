---
name: issue-to-pr
description: Implement a GitHub issue end to end — read the issue and its specs, branch, plan, implement following project guidelines, run tests locally, and open a PR. Use when asked to work on, implement, or fix an issue by number or URL.
---

# Implement a GitHub issue

Takes an issue number or URL and delivers a pull request that resolves it.
Work through the steps in order. Do not skip a step.

## 1. Read the issue

```bash
gh issue view <number> --comments
```

- Extract the **goal**, the **acceptance criteria**, and any **linked specs**
  (files in the repo, other issues, external docs). Read every linked spec.
- Comments can override the original description; the latest decision wins.
- If the acceptance criteria are missing or contradictory, stop and ask
  (or comment on the issue) instead of guessing.

## 2. Read the project guidelines

Before touching code, read whichever of these exist:

- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`
- `docs/` or `specs/` files relevant to the issue
- Lint, format and test config (`package.json` scripts, `Makefile`,
  `pyproject.toml`, `.editorconfig`, CI workflows in `.github/workflows/`)

Note the conventions you must follow: code style, test layout, commit message
format, branch naming, and the exact commands CI runs.

## 3. Create a feature branch

```bash
git fetch origin
git switch <default-branch>
git pull --ff-only
git switch -c feat/<number>-<short-slug>
```

Use the project's branch naming convention if it defines one
(e.g. `fix/` for bugs). Never work directly on the default branch.

## 4. Plan the work

Write a short plan before implementing:

- Files to change or add, and why
- How each acceptance criterion will be met
- Tests to add or update for each criterion
- What is explicitly **out of scope**

Keep the change to what the issue asks for. Note unrelated problems you
notice for a follow-up instead of fixing them here.

## 5. Implement

- Follow the conventions from step 2.
- Add or update tests alongside the code, covering every acceptance criterion
  and the relevant edge cases from the specs.
- Commit in small, logical steps using the project's commit message format.
  Reference the issue (e.g. `#<number>`).

## 6. Run tests locally — required before pushing

Run the same checks CI runs, typically in this order:

1. Format / lint
2. Type check
3. Unit and integration tests
4. Build

- **Do not push if anything fails.** Fix the cause and re-run everything.
- Never skip, disable or loosen existing tests to make them pass.
- If a failure is pre-existing on the default branch and unrelated, confirm
  that by running it there, and mention it in the PR.

## 7. Push and open the PR

```bash
git push -u origin HEAD
gh pr create --title "<type>: <summary> (#<number>)" --body-file <file>
```

PR body:

```markdown
Closes #<number>

## Summary
What changed and why, in 2–4 sentences.

## Acceptance criteria
- [x] Criterion 1 — how it is met
- [x] Criterion 2 — how it is met

## Testing
Commands run locally and their result.

## Notes
Out-of-scope findings, follow-ups, pre-existing failures.
```

## 8. Report back

Share the PR link, a one-line summary, and anything that needs a human decision.

## Guardrails

- Never push to the default branch or force-push a shared branch.
- Never commit secrets, tokens or `.env` files.
- Never merge the PR yourself.
- If blocked (missing access, unclear spec, failing setup), stop and explain
  rather than working around it.