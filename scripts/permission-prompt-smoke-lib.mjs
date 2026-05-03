export const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

export const buildPermissionPromptCommand = ({
  marker,
  prompt = 'Do you want to proceed?',
  options = ['Yes', 'No'],
  sleepSeconds = 30,
}) => {
  const lines = [
    `printf ${shellQuote(`${prompt}\n\n`)}`,
    ...options.map((option, index) => {
      const prefix = index === 0 ? '> ' : '  ';
      return `printf ${shellQuote(`${prefix}${index + 1}. ${option}\n`)}`;
    }),
    'IFS= read -rsn1 choice',
    `printf ${shellQuote(`\n${marker}=%s\n`)} "$choice"`,
    `sleep ${Number(sleepSeconds) || 30}`,
  ];
  return `bash -lc ${shellQuote(lines.join('\n'))}`;
};

export const extractSelectedMarker = (content, marker) => {
  const escaped = String(marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content || '').match(new RegExp(`^${escaped}=([^\\r\\n]+)`, 'm'));
  return match?.[1] ?? null;
};

export const buildStatusWsUrl = (baseUrl) => {
  const url = new URL('/api/status', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
};
