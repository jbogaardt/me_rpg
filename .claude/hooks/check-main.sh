#!/usr/bin/env bash
# Stop hook: do not finish with work on a branch that has fallen behind origin/main (the drift rule in CLAUDE.md).
# Blocks once with a message (exit 2); the stop_hook_active guard means it never loops. Offline or on main: no-op.
input=$(cat)
case "$input" in *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;; esac
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
branch=$(git symbolic-ref --short -q HEAD) || exit 0
[ "$branch" = main ] && exit 0
git fetch origin main --quiet 2>/dev/null || exit 0

behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null) || exit 0
ahead=$(git rev-list --count "origin/main..HEAD" 2>/dev/null) || exit 0
[ "${behind:-0}" -eq 0 ] && exit 0
[ "${ahead:-0}" -eq 0 ] && exit 0 # nothing of ours to protect from drift

if git merge-tree --write-tree HEAD origin/main >/dev/null 2>&1; then
  echo "origin/main has $behind commit(s) not in $branch (it merges cleanly). Merge it now: git merge origin/main, then push (rapid-dev procedure in CLAUDE.md)." >&2
else
  echo "origin/main has $behind commit(s) that CONFLICT with $branch. Merge it now, resolve the conflicts, run npm run typecheck and npm run test, then push (rapid-dev procedure in CLAUDE.md). Resolving conflicts later only makes them bigger." >&2
fi
exit 2
