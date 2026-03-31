import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, capturePaneContent } from '@/lib/tmux';

// 선택지 줄 패턴: `❯ label`, `  label`, `❯ 1. label`, `  2. label`
const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(?:\d+\.\s+)?(.+)$/;
const PLAN_OPTION_KEYWORDS = ['Yes,', 'Yes ', 'No,', 'No ', 'Tell Claude'];

const isOptionLine = (line: string): boolean =>
  /^\s+\S/.test(line) || /^\s*[❯›>]/.test(line);

const parsePlanOptions = (paneContent: string): string[] => {
  const lines = paneContent.split('\n');
  const options: string[] = [];
  let foundFirst = false;

  for (const line of lines) {
    if (!line.trim()) {
      if (foundFirst) break;
      continue;
    }

    if (!isOptionLine(line)) {
      if (foundFirst) break;
      continue;
    }

    const match = line.match(INDICATOR_RE);
    if (!match) continue;
    const label = match[1].trim();

    if (!foundFirst) {
      if (PLAN_OPTION_KEYWORDS.some((kw) => label.startsWith(kw))) {
        options.push(label);
        foundFirst = true;
      }
    } else {
      if (PLAN_OPTION_KEYWORDS.some((kw) => label.startsWith(kw))) {
        options.push(label);
      } else {
        break;
      }
    }
  }

  return options;
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
      return res.status(200).json({ options: [] });
    }

    const options = parsePlanOptions(content);
    return res.status(200).json({ options });
  } catch (err) {
    console.log(`[tmux] plan-options query failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: '터미널 캡처 실패' });
  }
};

export default handler;
