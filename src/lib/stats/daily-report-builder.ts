import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import readline from 'readline';
import { execFile } from 'child_process';
import { shellPath } from '@/lib/preflight';
import { collectJsonlFiles } from './pt-stats-cache';
import type { IDailyReportDay } from '@/types/stats';

const CACHE_DIR = path.join(os.homedir(), '.purplemux', 'stats', 'daily-reports');

// --- Cache read/write ---

export const readAllCachedReports = async (): Promise<Record<string, IDailyReportDay>> => {
  const result: Record<string, IDailyReportDay> = {};
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(CACHE_DIR, file), 'utf-8');
        const data = JSON.parse(content) as IDailyReportDay;
        if (data.date && data.brief) {
          result[data.date] = data;
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // directory doesn't exist yet
  }
  return result;
};

const writeCachedReport = async (report: IDailyReportDay): Promise<void> => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(CACHE_DIR, `${report.date}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
};

// --- Session data extraction ---

interface ISessionData {
  project: string;
  start: string;
  msgCount: number;
  toolCount: number;
  firstMessage: string;
}

const shortenCwd = (cwd: string): string => {
  const home = os.homedir();
  const rel = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
  return rel
    .replace(/^Workspace\/github\.com\//g, '')
    .replace(/^Workspace\/gitlab\.kolonfnc\.com\//g, 'gitlab/')
    .replace(/^Documents\//g, 'docs/')
    .replace(/^Downloads/g, 'Downloads');
};

const extractSessionsForDate = async (targetDate: string): Promise<ISessionData[]> => {
  const files = await collectJsonlFiles();
  const sessions: ISessionData[] = [];

  for (const filePath of files) {
    const userMessages: { time: string; text: string }[] = [];
    const timestamps: string[] = [];
    let toolCount = 0;
    let cwd = '';

    try {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const ts = String(entry.timestamp ?? '');
          if (!ts.startsWith(targetDate)) continue;

          timestamps.push(ts);
          const type = String(entry.type ?? '');

          if (!cwd && typeof entry.cwd === 'string') {
            cwd = entry.cwd;
          }

          if (type === 'user') {
            const message = entry.message as Record<string, unknown> | undefined;
            if (!message) continue;
            const content = message.content;
            let text = '';

            if (typeof content === 'string') {
              text = content.slice(0, 300);
            } else if (Array.isArray(content)) {
              const texts: string[] = [];
              for (const c of content) {
                if (typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text') {
                  texts.push(String((c as Record<string, unknown>).text ?? '').slice(0, 300));
                }
              }
              text = texts.join(' | ');
            }

            if (text.includes('<command-message>')) {
              const match = text.match(/<command-name>\/([^<]+)<\/command-name>/);
              text = `[Command: ${match ? match[1] : 'unknown'}]`;
            }
            if (text.includes('<local-command-caveat>') || text.includes('<task-notification>')) {
              continue;
            }
            if (text.trim()) {
              userMessages.push({ time: ts.slice(11, 16), text: text.slice(0, 200) });
            }
          }

          if (type === 'assistant') {
            const message = entry.message as Record<string, unknown> | undefined;
            if (!message) continue;
            const content = message.content as unknown[];
            if (Array.isArray(content)) {
              toolCount += content.filter(
                (c) => typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'tool_use',
              ).length;
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file read error
    }

    if (timestamps.length > 0 && userMessages.length > 0) {
      const project = cwd ? shortenCwd(cwd) : path.basename(path.dirname(filePath));
      sessions.push({
        project,
        start: Math.min(...timestamps.map((t) => new Date(t).getTime())).toString(),
        msgCount: userMessages.length,
        toolCount,
        firstMessage: userMessages[0].text,
      });
    }
  }

  sessions.sort((a, b) => Number(a.start) - Number(b.start));
  return sessions;
};

// --- Claude CLI summary generation ---

const buildPromptData = (sessions: ISessionData[]): string => {
  return sessions
    .map((s) => {
      const time = new Date(Number(s.start)).toTimeString().slice(0, 5);
      return `[${time}] [${s.project}] 메시지 ${s.msgCount}개, 도구 ${s.toolCount}회 | ${s.firstMessage}`;
    })
    .join('\n');
};

const callClaudeCli = (input: string, systemPrompt: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p'],
      { timeout: 120_000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: shellPath } },
      (error, stdout) => {
        if (error) {
          reject(new Error(`claude -p failed: ${error.message}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
    child.stdin?.write(`${systemPrompt}\n\n${input}`);
    child.stdin?.end();
  });
};

const SUMMARY_PROMPT = (date: string) =>
  `${date}의 Claude 세션 내역을 요약해주세요.

출력 형식 (반드시 이 형식만 사용):

[BRIEF]
하루 전체를 2-3줄로 요약. 개조식 명사형 종결. 순수 텍스트만 작성. 마크다운 헤딩(#), 구분선(---) 사용 금지.

[DETAIL]
## 프로젝트명
### 주요 기능/영역
- 작업 항목 한줄 요약
- 작업 항목 한줄 요약
### 다른 기능/영역
- 작업 항목 한줄 요약

규칙:
- [BRIEF]와 [DETAIL] 태그는 각각 정확히 한 번만, 줄 맨 앞에 작성
- 태그 외의 메타 텍스트(구분선, 번호, 설명) 삽입 금지
- 프로젝트가 1개여도 반드시 ## 프로젝트명 헤딩 포함
- 각 항목은 한 줄 — 파일명, 코드 없이
- 개조식 명사형 종결 (예: "로그인 로직 수정", "모바일 레이아웃 개선"). "-다", "-했다", "-시작" 등 서술형 금지
- WHAT 중심 (HOW 아님)
- 사소한 대화(인사, 1회성 질문, 커밋 명령)는 생략
- 한글로 작성

데이터:`;

const stripTrailingMarkdownNoise = (text: string): string =>
  text.replace(/[\s#\-]*$/, '').trim();

const parseSummaryResponse = (response: string): { brief: string; detail: string } => {
  const briefMatch = response.match(/\[BRIEF\]\s*\n([\s\S]*?)(?=\[DETAIL\])/);
  const detailMatch = response.match(/\[DETAIL\]\s*\n([\s\S]*?)$/);

  return {
    brief: briefMatch ? stripTrailingMarkdownNoise(briefMatch[1]) : response.slice(0, 500),
    detail: detailMatch ? detailMatch[1].trim() : '',
  };
};

// --- Public API ---

export const generateDailyReport = async (date: string, force = false): Promise<IDailyReportDay> => {
  if (!force) {
    const existing = await readCachedReport(date);
    if (existing) return existing;
  }

  const sessions = await extractSessionsForDate(date);
  if (sessions.length === 0) {
    const empty: IDailyReportDay = {
      date,
      brief: '활동 내역이 없습니다.',
      detail: '',
      generatedAt: new Date().toISOString(),
    };
    await writeCachedReport(empty);
    return empty;
  }

  const promptData = buildPromptData(sessions);
  const response = await callClaudeCli(promptData, SUMMARY_PROMPT(date));
  const { brief, detail } = parseSummaryResponse(response);

  const report: IDailyReportDay = {
    date,
    brief,
    detail,
    generatedAt: new Date().toISOString(),
  };

  await writeCachedReport(report);
  return report;
};

export const readCachedReport = async (date: string): Promise<IDailyReportDay | null> => {
  try {
    const content = await fs.readFile(path.join(CACHE_DIR, `${date}.json`), 'utf-8');
    const data = JSON.parse(content) as IDailyReportDay;
    return data.date && data.brief ? data : null;
  } catch {
    return null;
  }
};
