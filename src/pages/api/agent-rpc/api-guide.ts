import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAgentToken } from '@/lib/agent-token';

const guide = `# purplemux API Reference

All endpoints require \`-H "X-Agent-Token: TOKEN"\` header.
Base: http://localhost:PORT

---

## Workspace

### GET /api/workspace
워크스페이스 목록 조회.
Response: { workspaces: [{ id, name, directories, order }], sidebarCollapsed, sidebarWidth }

---

## Layout (탭/패인 구조)

### GET /api/layout?workspace=WORKSPACE_ID
워크스페이스의 레이아웃(패인 트리, 탭 목록) 조회.
Response: { root: TLayoutNode, activePaneId, updatedAt }
- Split node: { type: "split", orientation, ratio, children: [node, node] }
- Pane node: { type: "pane", id, tabs: [ITab], activeTabId }
- ITab: { id, sessionName, name, panelType, cwd, title, lastCommand, webUrl }

### GET /api/layout/cwd?session=SESSION_NAME
세션의 현재 작업 디렉토리 조회.
Response: { cwd, lastCommand? }

### POST /api/layout/pane?workspace=WORKSPACE_ID
패인 분할/생성.
Body: { sourcePaneId?, orientation?: "horizontal"|"vertical", cwd? }
Response: { paneId, tab }

### POST /api/layout/pane/PANE_ID/tabs?workspace=WORKSPACE_ID
패인에 새 탭 추가.
Body: { name?, cwd?, panelType?, command? }
Response: ITab

---

## Git

### GET /api/git/status?tmuxSession=SESSION_NAME
Git 상태 조회.
Response: { status: { branch, ahead, behind, staged, modified, untracked, ... } }

### GET /api/git/branch?tmuxSession=SESSION_NAME
현재 브랜치명 조회.
Response: { branch }

---

## Config

### GET /api/config
앱 설정 조회.
Response: { appTheme, terminalTheme, editorUrl?, agentEnabled, dangerouslySkipPermissions }

---

## Stats

### GET /api/stats/overview?period=today|7d|30d|all
사용 통계 개요.
Response: { totalSessions, totalMessages, dailyActivity, tokenUsage, costs, ... }

### GET /api/stats/projects?period=today|7d|30d|all
프로젝트별 통계.
Response: { projects: [{ name, sessions, messages, ... }] }

---

## Timeline

### GET /api/timeline/sessions?tmuxSession=SESSION&limit=N&offset=N&cwd=PATH
세션 히스토리 조회.
Response: { sessions: [{ id, startTime, ... }], total, hasMore }

### GET /api/timeline/entries?jsonlPath=PATH&limit=N
타임라인 엔트리 조회.
Response: { entries, startByteOffset, hasMore }

---

## Tmux

### GET /api/tmux/info?session=SESSION_NAME
터미널 패인 정보 조회.
Response: { width, height, lastCommand?, sessionName }

### POST /api/tmux/send-input
세션에 입력 전송.
Body: { session, input }

---

## Message History

### GET /api/message-history?wsId=WORKSPACE_ID
워크스페이스 메시지 히스토리.
Response: { entries: [{ id, message, createdAt }] }

---

## System

### GET /api/system/tmux-sessions
활성 tmux 세션 수.
Response: { count }

### GET /api/check-claude?session=SESSION_NAME
Claude 실행 여부 확인.
Response: { running, checkedAt }

### GET /api/tailscale/status
Tailscale 상태.
Response: { installed, running, dnsName, tailscaleIp, serveEntries }
`;

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyAgentToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const accept = req.headers.accept || '';
  if (accept.includes('application/json')) {
    return res.status(200).json({ content: guide });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(guide);
};

export default handler;
