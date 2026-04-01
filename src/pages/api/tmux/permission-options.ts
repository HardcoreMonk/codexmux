import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, capturePaneContent } from '@/lib/tmux';

export interface IPermissionOption {
  label: string;
  focusedIndex: number;
}

export interface IPermissionOptionsResponse {
  options: string[];
  focusedIndex: number;
}

const PERMISSION_KEYWORDS = [
  'Yes',
  'Yes,',
  'No',
];

const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(.+)$/;
const FOCUSED_RE = /^\s*[❯›>]\s+/;

const parsePermissionOptions = (paneContent: string): { options: string[]; focusedIndex: number } => {
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

    if (!foundFirst) {
      if (PERMISSION_KEYWORDS.some((kw) => label.startsWith(kw))) {
        if (isFocused) focusedIndex = options.length;
        options.push(label);
        foundFirst = true;
      }
    } else {
      if (PERMISSION_KEYWORDS.some((kw) => label.startsWith(kw))) {
        if (isFocused) focusedIndex = options.length;
        options.push(label);
      } else {
        break;
      }
    }
  }

  // permission prompt는 반드시 "Yes"로 시작하고 "No"를 포함해야 함
  const hasYes = options.some((o) => o.startsWith('Yes'));
  const hasNo = options.some((o) => o.startsWith('No'));
  if (!hasYes || !hasNo || options.length < 2) {
    return { options: [], focusedIndex: 0 };
  }

  return { options, focusedIndex };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  if (!session) {
    return res.status(400).json({ error: 'session 파라미터 필수' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
  }

  try {
    const content = await capturePaneContent(session);
    if (!content) {
      return res.status(200).json({ options: [], focusedIndex: 0 });
    }

    const result = parsePermissionOptions(content);
    return res.status(200).json(result);
  } catch (err) {
    console.log(`[tmux] permission-options query failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: '터미널 캡처 실패' });
  }
};

export default handler;
