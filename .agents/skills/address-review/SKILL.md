---
name: address-review
description: Address review feedback on a pull request in a fresh session — rebuild context from GitHub, fix what the review requires, run tests locally, push to the PR branch, and reply on every thread. Use when a review is submitted on a PR, or when asked to address, resolve or respond to review comments.
---

# Address review feedback

Runs as a **new session** with no memory of the session that wrote the code or
the one that reviewed it. Everything you need is on GitHub: the PR, its linked
issue, the review threads, and earlier replies. Rebuild context from there.

Runs unattended. Never stop to ask the user. When something is unclear, reply
on the thread asking the reviewer, and move on.

## 1. Load the PR

```bash
gh pr view <number> --json number,title,body,author,headRefName,headRefOid,baseRefName,closingIssuesReferences,reviews,isDraft,mergeable
gh pr checkout <number>
```

- Read the PR description and every **linked issue** (`gh issue view <n> --comments`)
  with its specs. The acceptance criteria still define the scope.
- Read the project guidelines: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`,
  and the commands CI runs (`.github/workflows/`).
- Stop and post a PR comment explaining why if:
  - the PR is closed or merged
  - the branch has merge conflicts with the base (`mergeable: CONFLICTING`).
    Don't rebase or force-push; a human resolves conflicts.

## 2. Collect the open review threads

Inline threads (with resolution state) come from GraphQL:

```bash
gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<number> -f query='
query($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) {
      reviewThreads(first:100) {
        nodes {
          id isResolved isOutdated path line startLine
          comments(first:50) { nodes { databaseId author { login } body createdAt } }
        }
      }
    }
  }
}'
```

Also read the **summary body** of the latest review (`reviews` from step 1).
Findings listed there without a line are in scope too.

**Work on a thread only if:**
- it is unresolved, and
- the last comment is from the reviewer, not a reply from this skill
  (replies carry the marker `<!-- address-review -->`).

That makes re-runs safe: threads already answered are skipped until the
reviewer responds again.

## 3. Check the round limit

Count earlier summary comments on the PR containing `<!-- address-review:round -->`.
If there are already **3**, don't change code. Post a comment saying the
review loop needs a human decision, list the open threads, and stop.
This prevents an endless review → fix → review loop between automations.

## 4. Triage every finding

Decide what to do for each thread, using the severity prefix the reviewer used:

| Prefix | Action |
|--------|--------|
| **Critical:** | Fix. Always. |
| *(no prefix)* — Required | Fix, unless it's technically wrong (see below). |
| **Optional:** / **Consider:** | Apply if small and within the issue's scope; otherwise decline with a reason. |
| **Nit:** | Apply if trivial. |
| **FYI** | No code change. Reply only if useful. |
| Suggestion block | Apply exactly as written, unless it breaks tests or conflicts with another fix. |

**Disagreeing is allowed** when you have a technical reason: the finding is
factually wrong, conflicts with the spec or project guidelines, or the code
already handles it. Reply with the evidence (spec section, test, line). Don't
change the code, and leave the thread unresolved for the reviewer.

**Out of scope** — the finding is valid but goes beyond the linked issue:
don't implement it. Reply proposing a follow-up issue.

**Unclear** — you can't tell what the reviewer wants: reply with a specific
question. Don't guess.

**Outdated threads** (`isOutdated: true`): check whether the current code
still has the problem before acting.

Write the triage down before editing: thread → action → planned change.

## 5. Make the changes

- Follow the project guidelines, the same as when the code was written.
- Keep every change tied to a thread. No unrelated refactors or drive-by fixes.
- Add or update tests when a fix changes behaviour, especially for anything
  the reviewer flagged as untested.
- Commit in small, logical commits in the project's message format, e.g.
  `fix: parameterize task query (review)`.

## 6. Run tests locally — required before pushing

Run what CI runs: format/lint, type check, tests, build.

- **Do not push if anything fails.** Fix the cause and re-run everything.
- Never skip, disable or loosen tests to get green.
- A failure that also happens on the base branch, unrelated to this PR: note
  it in the summary comment, then push.
- If you can't make the suite pass, don't push. Reply on the affected threads
  and post a summary comment explaining what's blocked.

## 7. Push

```bash
git push
```

Push to the PR's own branch. Never force-push, never rebase, never push to
the base branch.

## 8. Reply on every thread you handled

Reply in the thread (not as a new top-level comment):

```bash
gh api repos/{owner}/{repo}/pulls/<number>/comments/<comment_databaseId>/replies \
  --method POST -f body='<reply>'
```

Use the `databaseId` of the thread's **first** comment.

Every reply ends with `<!-- address-review -->` and says one of:

- **Fixed in `<short-sha>`** — what changed, in one sentence.
- **Applied suggestion in `<short-sha>`.**
- **Not changed** — the technical reason, with evidence.
- **Out of scope** — proposed as a follow-up.
- **Question** — what you need to know.

Don't resolve threads. The reviewer resolves them after verifying the fix.

## 9. Post a summary comment

One top-level PR comment:

```markdown
<!-- address-review:round -->
### Review addressed — round <n>

**Fixed:** 4 · **Declined:** 1 · **Questions:** 1 · **Out of scope:** 1

- Fixed: SQL built by string concatenation (`src/db/tasks.ts`) — <sha>
- Declined: rename of `scan()` — conflicts with the public API in spec §3
- Question: empty-repo behaviour — see thread on `src/scan.ts:40`
- Follow-up: caching between scans

**Tests:** lint, types, unit, build — all passing locally.
```

## Guardrails

- Never merge the PR, approve it, or dismiss a review.
- Never edit or delete the reviewer's comments.
- Never force-push or rewrite history on the PR branch.
- Never commit secrets, tokens or `.env` files.
- Never expand scope beyond the linked issue and the review.
- If blocked (no access, conflicts, failing setup), stop and explain in a PR comment.