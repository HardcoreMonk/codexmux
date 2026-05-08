# App-server Protocol Contract 설계

## 목표

Windows tray-first engine host와 provider adapter 검토 전에 Electron app shell이 server endpoint를 해석하는
규칙을 작은 protocol helper로 고정한다. 이 단계는 engine host를 새로 만들지 않고, local/remote app-server
주소 contract를 테스트 가능한 형태로 분리한다.

## 범위

- Electron app-server mode는 `local` 또는 `remote`이다.
- Remote URL은 `http://` 또는 `https://`만 허용한다.
- Scheme이 없는 remote input은 `http://`를 붙여 정규화한다.
- 잘못 저장된 remote config는 local mode로 fallback한다.
- Local URL과 menu label은 active engine port에서 생성한다.
- Electron main은 inline URL parsing 대신 helper를 사용한다.

## 제외

- Tray-first engine host 구현
- Windows Service 설치/소유권 변경
- Provider adapter 추가
- Server port 기본값 변경
- Browser-facing WebSocket protocol 변경

## 성공 기준

- invalid remote URL과 unsupported scheme이 거부된다.
- persisted server config가 invalid이면 local mode로 fallback한다.
- local active port에서 `http://localhost:<port>` URL을 만든다.
- Electron main bundle이 새 helper를 포함해 성공적으로 빌드된다.
- focused Electron protocol test, `tsc`, `lint`, full test, `build:electron:main`이 통과한다.
