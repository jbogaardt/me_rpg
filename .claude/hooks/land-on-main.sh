#!/usr/bin/env bash
# Stop hook: land finished work on main (the rapid-dev rule in CLAUDE.md: always push to main, branches are short-lived).
# When the session's branch has committed work and a clean tree, it merges origin/main into the branch (if needed), pushes
# the branch as origin/main (a fast-forward), then checks out main, fast-forwards it and deletes the merged branch (local and
# remote, best effort). Blocks once (exit 2) when the merge conflicts, so the session resolves it. No-op on main, offline,
# with a dirty tree or with nothing ahead. The stop_hook_active guard means it never loops.
input=$(cat)
case "$input" in *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;; esac
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
branch=$(git symbolic-ref --short -q HEAD) || exit 0
[ "$branch" = main ] && exit 0
git remote get-url origin >/dev/null 2>&1 || exit 0

# Only committed work: a dirty tree or untracked files are the session's to finish first.
git diff --quiet && git diff --cached --quiet || exit 0
[ -z "$(git ls-files --others --exclude-standard)" ] || exit 0

git fetch origin main --quiet 2>/dev/null || exit 0
ahead=$(git rev-list --count "origin/main..HEAD" 2>/dev/null) || exit 0
[ "${ahead:-0}" -eq 0 ] && exit 0

# Bring main in first. A conflict is the session's to resolve: block once with the instruction.
if [ "$(git rev-list --count "HEAD..origin/main")" -gt 0 ]; then
  if ! git merge-tree --write-tree HEAD origin/main >/dev/null 2>&1; then
    echo "origin/main conflicts with $branch. Merge it now (git merge origin/main), resolve, run npm run typecheck and npm run test, then this hook lands it on main." >&2
    exit 2
  fi
  git merge --no-edit --quiet origin/main || { git merge --abort; exit 2; }
fi

# Main must not hold anything the remote lacks, or resetting it would lose work.
git merge-base --is-ancestor main origin/main 2>/dev/null || {
  echo "Local main has commits origin/main lacks; not touching it. Push or reconcile main by hand." >&2
  exit 0
}

pushed=
for delay in 0 2 4 8 16; do
  sleep "$delay"
  git push origin "HEAD:refs/heads/main" --quiet 2>/dev/null && { pushed=1; break; }
  git fetch origin main --quiet 2>/dev/null
done
[ -n "$pushed" ] || { echo "Could not push $branch to origin/main; try again." >&2; exit 2; }

git checkout --quiet main && git merge --ff-only --quiet origin/main
git branch -D "$branch" --quiet
git push origin --delete "$branch" --quiet 2>/dev/null || echo "Merged to main; could not delete origin/$branch (remote refused). Delete it on GitHub." >&2
exit 0
