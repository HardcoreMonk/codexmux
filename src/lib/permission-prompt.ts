const OPTION_KEYWORDS = [
  'Yes', 'Yes,', 'No',
  'Accept', 'Decline',
  'Open System Settings', 'Try again',
  'Use this', 'Continue without',
  // ink Select dialog keywords (Resume Return, Idle Return)
  'Resume from summary', 'Resume full session',
  'Continue this conversation', 'Send message as',
  "Don't ask me again",
];
const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(.+)$/;
const FOCUSED_RE = /^\s*[❯›>]\s+/;
const NUMBER_PREFIX_RE = /^\d+\.\s+/;

const stripPrefix = (o: string) => o.replace(NUMBER_PREFIX_RE, '');
const hasOption = (options: string[], prefix: string) =>
  options.some((o) => stripPrefix(o).startsWith(prefix));

const isKnownPromptPattern = (options: string[]): boolean => {
  if (options.length < 2) return false;
  return (hasOption(options, 'Yes') && hasOption(options, 'No'))
    || (hasOption(options, 'Accept') && hasOption(options, 'Decline'))
    || hasOption(options, 'Open System Settings')
    || (hasOption(options, 'Use this') && hasOption(options, 'Continue without'))
    || (hasOption(options, 'Resume from summary') && hasOption(options, 'Resume full session'))
    || (hasOption(options, 'Continue this conversation') && hasOption(options, 'Send message as'));
};

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
    const stripped = stripPrefix(label);
    const isKeyword = OPTION_KEYWORDS.some((kw) => stripped.startsWith(kw));

    if (isKeyword) {
      if (isFocused) focusedIndex = options.length;
      options.push(label);
      foundFirst = true;
    }
    // foundFirst 이후 키워드 매치 안 되는 들여쓰기 라인은 이전 옵션의 wrap된 continuation → skip
  }

  if (!isKnownPromptPattern(options)) {
    return { options: [], focusedIndex: 0 };
  }

  return { options, focusedIndex };
};

export const hasPermissionPrompt = (paneContent: string): boolean =>
  parsePermissionOptions(paneContent).options.length > 0;
