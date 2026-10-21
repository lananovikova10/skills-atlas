---
name: grooming
description: Groom the GitHub issue backlog — validate new bug reports, close duplicates and bugs that no longer reproduce, assign priority, type, area and size labels, and delegate the top issues to AI within a work-in-progress limit. Use on a schedule after the red agent runs, or when asked to triage, groom or prioritise issues.
---

# Grooming — triage the backlog

The red agent files bugs labelled `needs-triage`. This skill turns that pile
into a prioritised backlog and decides which issues get **"Delegated to AI"**,
the label that starts the `issue-to-pr` automation. It is the only actor that
adds that label to red-agent issues.

Runs unattended. Never stop to ask; when something needs a human, label it
and say so in a comment.

## 1. Make sure the label set exists

Create any that are missing (`gh label create <name> --color <hex> --description <text>`):

| Group | Labels |
|-------|--------|
| Priority | `P0` `P1` `P2` `P3` |
| Type | `bug` `ux` `a11y` `security` `performance` |
| Area | `area:web` `area:cli` `area:core` `area:search` `area:graph` |
| Size | `size:S` `size:M` `size:L` |
| Status | `needs-triage` `needs-info` `needs-decision` `duplicate` |

Never create or rename "Delegated to AI"; it must already exist.

## 2. Load the backlog

```bash
gh issue list --state open --label needs-triage --limit 100 \
  --json number,title,body,labels,createdAt,author,comments
gh issue list --state open --limit 300 --json number,title,body,labels
```

The first list is what you groom this run. The second is context for
duplicates and for the work-in-progress limit.

Also check what is already in flight:

```bash
gh issue list --state open --label "Delegated to AI" --json number,title
gh pr list --state open --json number,title,closingIssuesReferences
```

## 3. Validate each issue

For every `needs-triage` issue:

1. **Complete?** It needs steps to reproduce, expected and actual behaviour,
   and evidence. If something essential is missing, label `needs-info`,
   comment what's missing, and skip the rest of grooming for it.
2. **Still reproduces?** If the issue has a repro test, run it against the
   current default branch:

   ```bash
   git fetch origin && git switch --detach origin/<default-branch>
   npx playwright test <path-from-issue>
   ```

   (Copy the test from the issue body into `e2e/red-agent/` if it isn't in
   the repo.) If it now **passes**, the bug is gone: comment with the commit
   you tested and close the issue as completed.
3. **Really a bug?** If it's a feature request or the spec doesn't say what
   should happen, label `needs-decision` and explain what needs deciding.

## 4. Find duplicates

Compare each issue with the open backlog and with each other: same
component, same broken behaviour, same root cause. Matching titles alone
aren't enough.

- Keep the issue with the clearest repro (usually the oldest).
- On the others: comment `Duplicate of #<n>`, label `duplicate`, and close
  as not planned:

  ```bash
  gh issue close <n> --reason "not planned" --comment "Duplicate of #<keep>. <one line why>"
  ```

- Copy any extra evidence or affected places into a comment on the kept issue.
- Only close issues the red agent opened (body contains `<!-- red-agent:`).
  For a human-written duplicate, comment with the link and leave it open.

## 5. Assign labels

**Priority**

| Label | When |
|-------|------|
| `P0` | Wrong or missing data, crash or uncaught exception in a core flow, security issue |
| `P1` | Core flow broken or spec violated, with a workaround |
| `P2` | Edge cases, unusual input, layout broken at uncommon sizes |
| `P3` | Cosmetic, minor text or alignment issues |

Core flows: analyse a repository, see the list, search, filter, sort,
open a skill link.

**Type**, **area**: pick one type and one or more areas from step 1.

**Size**: `size:S` if one component and the repro test covers it,
`size:M` if a few components, `size:L` if it needs a design change.
`size:L` also gets `needs-decision`.

If a priority, type or area label is already present and no earlier
grooming comment exists, a human set it: keep it.

## 6. Delegate within the limit

An issue may get "Delegated to AI" only if **all** of these hold:

- priority `P0`, `P1` or `P2`
- it has a repro test that fails on the default branch
- not `security`, `needs-info`, `needs-decision` or `size:L`
- no open PR already references it

**Work-in-progress limit: 3.** Count open issues already labelled
"Delegated to AI". Add the label only until that count reaches 3, in order
of priority, then age (oldest first). The rest stay groomed but undelegated;
a later run picks them up when slots free up.

Delegate with a separate call per issue, after all other labels are set,
because adding the label starts an automation run:

```bash
gh issue edit <n> --add-label "Delegated to AI"
```

## 7. Finish each issue

- Remove `needs-triage` from every issue you groomed, delegated or not.
- Leave one comment per issue:

  ```markdown
  <!-- grooming -->
  **Triage:** P1 · bug · area:search · size:S
  **Why:** <one sentence on impact>
  **Next:** Delegated to AI | Waiting for a free slot (3/3 in progress) |
  Needs info: <what> | Needs decision: <what>
  ```

- Don't edit the issue body.

## 8. Report

End the run with a summary:

```markdown
### Grooming run — <date>
Groomed 12 · Delegated 2 (#41, #44) · Duplicates closed 3 · No longer reproducing 1
Needs info 1 · Needs decision 2 · Waiting for a slot 3

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 41 | … | P0 | Delegated |
```

## Guardrails

- Never delegate a security issue, or an issue without a failing repro.
- Never exceed the work-in-progress limit.
- Never close a human-written issue; only comment.
- Never override labels a human set.
- Never edit issue bodies, code, or branches; this skill only labels,
  comments, and closes red-agent duplicates or fixed bugs.