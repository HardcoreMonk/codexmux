# Codex State SQLite 읽기 전용 Indexer 설계

## 목표

Codex CLI가 `~/.codex/state_*.sqlite` 파일을 생성하는 환경에서 codexmux가 해당 파일의 존재와
schema 형태를 안전하게 확인할 수 있는 기반을 둔다. 이 단계는 session/timeline의 canonical source를
바꾸지 않고, Codex 소유 SQLite를 탐색하는 read-only probe로 제한한다.

## 범위

- `~/.codex` 바로 아래의 `state_*.sqlite` 파일만 대상으로 한다.
- SQLite는 `readonly: true`, `fileMustExist: true`로 열고 `query_only = ON`을 적용한다.
- 반환 값은 file name, file size, mtime, table name, column name/type/nullability/pk, table row count로 제한한다.
- row content, prompt, terminal output, JSONL path, cwd payload는 읽거나 저장하지 않는다.
- `better-sqlite3` native binding이 없거나 열 수 없으면 throw하지 않고 sanitized error code로 표시한다.

## 제외

- Codex state SQLite row ingestion
- session/timeline/status source 전환
- UI 노출
- Codex 원본 파일 생성, migration, vacuum, write
- provider adapter 계약 변경

## 경계

`~/.codex`는 Codex CLI 소유 영역이다. codexmux는 현재도 `~/.codex/sessions/` JSONL을 읽기 전용으로
참조하고 있으며, 이번 SQLite probe도 같은 정책을 따른다. 새 helper는 외부 DB schema를 모르는 상태에서
운영자가 안전하게 구조만 확인할 수 있도록 만든 기초 모듈이다.

## 성공 기준

- Codex dir이 없을 때 SQLite opener를 호출하지 않고 `missing`으로 반환한다.
- `state_*.sqlite`만 열고 `state_*.sqlite-wal`, 다른 `.sqlite` 파일은 무시한다.
- DB open 옵션이 읽기 전용으로 고정된다.
- schema/count summary에 row content가 섞이지 않는다.
- native binding 누락 또는 open 실패가 전체 호출 실패로 번지지 않는다.
- focused unit test, `tsc`, `lint`, full test가 통과한다.
