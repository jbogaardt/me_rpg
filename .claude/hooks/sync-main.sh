#!/usr/bin/env bash
# SessionStart hook: keep the working branch current with origin/main (the "Merge main in first, and often" rule in
# CLAUDE.md). A clean merge is done for you; a conflicting one is reported so it is resolved before any other work.
# Never fails the session: offline, detached HEAD or anything unexpected just does nothing.
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
git fetch origin main --quiet 2>/dev/null || exit 0
branch=$(git symbolic-ref --short -q HEAD) || exit 0

if [ "$branch" = main ]; then
  git merge --ff-only --quiet origin/main >/dev/null 2>&1
  exit 0
fi

behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null) || exit 0
[ "${behind:-0}" -eq 0 ] && exit 0

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "origin/main has $behind new commit(s) not in $branch, but the working tree has uncommitted changes, so it was not merged. Commit, then merge origin/main before pushing."
  exit 0
fi

if git merge-tree --write-tree HEAD origin/main >/dev/null 2>&1; then
  if git merge --no-edit --quiet origin/main >/dev/null 2>&1; then
    echo "Merged origin/main ($behind new commit(s)) into $branch, so this session starts current."
  else
    git merge --abort >/dev/null 2>&1
    echo "origin/main has $behind new commit(s) not in $branch and merges cleanly, but the merge could not be committed (git identity?). Run: git merge origin/main"
  fi
else
  echo "origin/main has $behind new commit(s) that CONFLICT with $branch. Before other work: git merge origin/main, resolve the conflicts, run npm run typecheck and npm run test, and push (see Working procedure in CLAUDE.md)."
fi
exit 0
