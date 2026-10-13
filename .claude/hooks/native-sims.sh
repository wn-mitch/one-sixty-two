#!/usr/bin/env bash
# PreToolUse guard: repeated season simulations run natively and in parallel (engine-cli), never as
# loops over the wasm engine from Node. One `just smoke` run as a check is fine.
command=$(jq -r '.tool_input.command // empty')
[ -z "$command" ] && exit 0
# A heredoc body is file content, not commands; only the line that opens it runs.
grep -q '<<' <<<"$command" && command=$(sed '/<</q' <<<"$command")
repo=$(cd "$(dirname "$0")/../.." && pwd)

deny() {
	echo "Blocked: $1 Batch drafts and season simulations must use the native engine (engine-cli, e.g. \`just draft-spread\` or \`just hill-climb\`), which drafts and plays in parallel. A single \`just smoke\` run is fine." >&2
	exit 2
}

# Shell loop syntax, not the bare words, so prose that mentions them passes.
loop='(for [A-Za-z_][A-Za-z0-9_]* in |while [^;]*; *do|until [^;]*; *do|xargs |seq [0-9$]|(^|[|;&] *)parallel )'
smoke='(npm run smoke|just smoke|smoke-season\.ts)'
# Several smoke runs in one command, or a smoke run inside a loop.
[ "$(grep -oE "$smoke" <<<"$command" | wc -l)" -gt 1 ] && deny 'this runs the wasm smoke season more than once.'
grep -qE "$smoke" <<<"$command" && grep -qE "$loop" <<<"$command" && deny 'this loops the wasm smoke season.'

# Scripts named in the command: a shell script that loops smoke runs, or a Node script outside the
# repository's own scripts and sources that drives the wasm engine.
# Globs in the command stay literal tokens rather than expanding to every matching file.
set -f
for token in $(grep -oE '[^[:space:]"'"'"'=]+\.(sh|ts|mjs|js)' <<<"$command"); do
	path=$token
	[ -f "$path" ] || path="$repo/$token"
	[ -f "$path" ] || continue
	case "$(cd "$(dirname "$path")" && pwd)/" in "$repo/scripts/"* | "$repo/src/"* | "$repo/engine"* | "$repo/.claude/"* | "$repo/tests/"*) continue ;; esac
	if grep -qE "$smoke" "$path" && grep -qE "$loop" "$path"; then deny "$token loops the wasm smoke season."; fi
	if grep -qE "engine/(node|core)(\.ts)?|simulateSeason\(" "$path"; then deny "$token drives the wasm engine from Node."; fi
	if grep -qE "draftRoster\(" "$path"; then deny "$token drafts rosters through the TypeScript draft engine."; fi
done
exit 0
