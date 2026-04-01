const PERMISSION_KEYWORDS = ['Yes', 'Yes,', 'No'];
const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(.+)$/;
const FOCUSED_RE = /^\s*[❯›>]\s+/;
const NUMBER_PREFIX_RE = /^\d+\.\s+/;

export const parsePermissionOptions = (paneContent: string): { options: string[]; focusedIndex: number } => {
  const lines = paneContent.split('\n');
  const options: string[] = [];
  let focusedIndex = 0;
  let foundFirst = false;

  for (const line of lines) {
    if (!line.trim()) {
      if (foundFirst) break;
      continue;
    }

    const isFocused = FOCUSED_RE.test(line);
    const isIndented = /^\s+\S/.test(line);

    if (!isFocused && !isIndented) {
      if (foundFirst) break;
      continue;
    }

    const match = line.match(INDICATOR_RE);
    if (!match) continue;
    const label = match[1].trim();
    const stripped = label.replace(NUMBER_PREFIX_RE, '');

    if (!foundFirst) {
      if (PERMISSION_KEYWORDS.some((kw) => stripped.startsWith(kw))) {
        if (isFocused) focusedIndex = options.length;
        options.push(label);
        foundFirst = true;
      }
    } else {
      if (PERMISSION_KEYWORDS.some((kw) => stripped.startsWith(kw))) {
        if (isFocused) focusedIndex = options.length;
        options.push(label);
      } else {
        break;
      }
    }
  }

  const hasYes = options.some((o) => o.replace(NUMBER_PREFIX_RE, '').startsWith('Yes'));
  const hasNo = options.some((o) => o.replace(NUMBER_PREFIX_RE, '').startsWith('No'));
  if (!hasYes || !hasNo || options.length < 2) {
    return { options: [], focusedIndex: 0 };
  }

  return { options, focusedIndex };
};

export const hasPermissionPrompt = (paneContent: string): boolean =>
  parsePermissionOptions(paneContent).options.length > 0;
