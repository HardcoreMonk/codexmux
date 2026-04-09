import path from 'path';
import os from 'os';

const BASE_DIR = path.join(os.homedir(), '.purplemux');
export const STATUSLINE_SCRIPT_PATH = path.join(BASE_DIR, 'statusline.sh');
export const RATE_LIMITS_FILE = path.join(BASE_DIR, 'rate-limits.json');

export const STATUSLINE_SCRIPT_CONTENT = `#!/bin/sh
input=$(cat)
OUTPUT="$HOME/.purplemux/rate-limits.json"
HAS_LIMITS=$(echo "$input" | jq -r 'if .rate_limits.five_hour or .rate_limits.seven_day then "yes" else "no" end' 2>/dev/null)
if [ "$HAS_LIMITS" = "yes" ]; then
  echo "$input" | jq -c '{
    ts: now,
    model: .model.display_name,
    five_hour: .rate_limits.five_hour,
    seven_day: .rate_limits.seven_day,
    context: {
      used_pct: .context_window.used_percentage,
      remaining_pct: .context_window.remaining_percentage,
      input_tokens: .context_window.total_input_tokens,
      output_tokens: .context_window.total_output_tokens,
      window_size: .context_window.context_window_size
    },
    cost: .cost
  }' > "$OUTPUT" 2>/dev/null
fi

# Check user statusLine: project local → project shared → global
PROJECT_DIR=$(echo "$input" | jq -r '.workspace.project_dir // empty')
USER_CMD=""
if [ -n "$PROJECT_DIR" ]; then
  USER_CMD=$(jq -r '.statusLine.command // empty' "$PROJECT_DIR/.claude/settings.local.json" 2>/dev/null)
  [ -z "$USER_CMD" ] && USER_CMD=$(jq -r '.statusLine.command // empty' "$PROJECT_DIR/.claude/settings.json" 2>/dev/null)
fi
[ -z "$USER_CMD" ] && USER_CMD=$(jq -r '.statusLine.command // empty' "$HOME/.claude/settings.json" 2>/dev/null)

if [ -n "$USER_CMD" ]; then
  echo "$input" | sh -c "$USER_CMD"
  exit 0
fi

MODEL=$(echo "$input" | jq -r '.model.display_name // empty')
CTX=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
IN_TOK=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
OUT_TOK=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
ADDED=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
REMOVED=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

fmt_tokens() {
  val=\$1
  if [ "\$val" -ge 1000000 ] 2>/dev/null; then
    printf "%.1fM" "\$(echo "\$val / 1000000" | bc -l)"
  elif [ "\$val" -ge 1000 ] 2>/dev/null; then
    printf "%.0fk" "\$(echo "\$val / 1000" | bc -l)"
  else
    echo "\$val"
  fi
}

TOKENS="\$(fmt_tokens \$((IN_TOK + OUT_TOK)))"
CTX_FMT=""
[ -n "$CTX" ] && CTX_FMT=" · ctx \$(printf '%.0f' "$CTX")%"

echo "\${MODEL}\${CTX_FMT} · \${TOKENS} · +\${ADDED} -\${REMOVED}"
`;
