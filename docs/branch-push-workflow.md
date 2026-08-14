# Branch and Push Workflow

This repository may have multiple people or agents changing files at the same time. Keep branches small and avoid rewriting work that is not yours.

## Branch Naming

Use short, descriptive branches:

```bash
git switch -c docs/ci-and-upload-guides
```

For Codex-created branches, prefer the `codex/` prefix unless the task asks for another convention:

```bash
git switch -c codex/docs-ci-upload-guides
```

## Before Editing

Check the current state:

```bash
git status --short
git branch --show-current
```

If there are unrelated modified files, leave them alone. If a file you must edit already has changes, read it first and preserve the existing intent.

## Commit Flow

Run the relevant checks before staging:

```bash
npm run lint
npm run check
```

Stage only files you intentionally changed:

```bash
git add README.md docs/local-development.md docs/ci-gates.md docs/upload-modes.md docs/branch-push-workflow.md
```

Commit with a focused message:

```bash
git commit -m "docs: add development and CI guides"
```

## Push Flow

Push the current branch:

```bash
git push -u origin HEAD
```

Open a pull request after the push. In the PR description, include:

- What changed.
- Which checks were run locally.
- Any known gaps or follow-up work.

## Conflict Rules

- Do not use `git reset --hard` to clean up a shared worktree.
- Do not checkout a file to discard changes unless you created those changes or the owner asks you to.
- Prefer a small follow-up commit over force-pushing rewritten history on shared branches.
- If generated files change unexpectedly, verify which command produced them before staging.
