import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, capturePaneContent, sendKeySequence } from '@/lib/tmux';

const FOCUSED_RE = /^\s*[❯›>]\s+/;
const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(.+)$/;
const PERMISSION_KEYWORDS = ['Yes', 'Yes,', 'No'];

const findFocusedIndex = (paneContent: string): { focusedIndex: number; totalOptions: number } => {
  const lines = paneContent.split('\n');
  let focusedIndex = 0;
  let optionCount = 0;
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
        if (isFocused) focusedIndex = optionCount;
        optionCount++;
        foundFirst = true;
      }
    } else {
      if (PERMISSION_KEYWORDS.some((kw) => label.startsWith(kw))) {
        if (isFocused) focusedIndex = optionCount;
        optionCount++;
      } else {
        break;
      }
    }
  }

  return { focusedIndex, totalOptions: optionCount };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, targetIndex } = req.body as { session?: string; targetIndex?: number };

  if (!session || targetIndex === undefined || targetIndex === null) {
    return res.status(400).json({ error: 'session, targetIndex 파라미터 필수' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
  }

  try {
    const content = await capturePaneContent(session);
    if (!content) {
      return res.status(400).json({ error: '터미널 내용을 읽을 수 없습니다' });
    }

    const { focusedIndex, totalOptions } = findFocusedIndex(content);
    if (totalOptions === 0) {
      return res.status(400).json({ error: 'permission 선택지를 찾을 수 없습니다' });
    }

    if (targetIndex < 0 || targetIndex >= totalOptions) {
      return res.status(400).json({ error: '유효하지 않은 옵션 인덱스' });
    }

    const delta = targetIndex - focusedIndex;
    const keys: string[] = [];

    if (delta > 0) {
      for (let i = 0; i < delta; i++) keys.push('Down');
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) keys.push('Up');
    }

    keys.push('Enter');
    await sendKeySequence(session, keys);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.log(`[tmux] send-permission failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: '선택 전송 실패' });
  }
};

export default handler;
