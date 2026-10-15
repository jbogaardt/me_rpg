#!/usr/bin/env bash
# PreToolUse hook for Bash: before a `git commit` that stages game code, hand Claude the CLAUDE.md "where a feature
# belongs" checklist so every new feature is placed in a layer (and made a capability when a story could do without it).
cmd=$(cat | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git diff --cached --name-only | grep -qE '^(src|tools|maps)/' || exit 0
extra=""
if git diff --cached --name-only | grep -q '^src/net/protocol.ts$' && ! git diff --cached -U0 src/net/protocol.ts | grep -q 'PROTOCOL_VERSION ='; then
  extra="$extra WARNING: src/net/protocol.ts changes but PROTOCOL_VERSION is not bumped (and its doc comment, and a protocol.test.ts case). If a message shape or meaning changed, bump it."
fi
if git diff --cached -U0 -- src | grep -E '^\+' | grep -q "enabled('"; then
  extra="$extra NOTE: this adds an enabled() gate: the capability must be in CAPABILITIES and listed in src/systems/CLAUDE.md (tools/content/capabilities.test.ts fails otherwise)."
fi
EXTRA="$extra" python3 - <<'PY'
import json, os
msg = (
    "Before this commit, check the change against CLAUDE.md 'Where a feature belongs': which layer is it "
    "(core engine / capability / content / pack)? Could a story reasonably do without it? Then it must be a "
    "capability (CAPABILITIES entry + enabled() at its one choke point + a line in src/systems/CLAUDE.md). Does it touch gameplay "
    "state? Then say what the host owns and what a guest is sent (protocol bump + test). Is the text for this feature updated in the nested CLAUDE.md or docs/ file that owns it (see the map in the root CLAUDE.md)? "
    "If any answer is missing, fix it first; otherwise go ahead." + os.environ.get("EXTRA", "")
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": msg}}))
PY
