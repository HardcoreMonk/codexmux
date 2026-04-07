import path from 'path';
import os from 'os';

const BASE_DIR = path.join(os.homedir(), '.purplemux');
export const STATUSLINE_SCRIPT_PATH = path.join(BASE_DIR, 'statusline.sh');
export const RATE_LIMITS_FILE = path.join(BASE_DIR, 'rate-limits.json');

export const STATUSLINE_SCRIPT_CONTENT = `#!/bin/sh
input=$(cat)
OUTPUT="$HOME/.purplemux/rate-limits.json"
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
echo ""
`;
