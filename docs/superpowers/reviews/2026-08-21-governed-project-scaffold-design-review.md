# Governed Project Scaffold Design Review

- 날짜: 2026-08-21
- 대상 spec: `docs/superpowers/specs/2026-08-21-governed-project-scaffold-design.md`
- 기준: `DESIGN.md`, `docs/STYLE.md`, 현재 Project Governance page
- 결과: 통과

## 검토 결과

### Information architecture

- Scaffold는 catalog 등록용 `GovernanceSetupPanel`에 넣지 않습니다. 선택한 Managed Project에
  적용하는 action이므로 `GovernanceReadModel`의 project summary 바로 아래 full-width section에
  둡니다.
- Action history는 같은 project detail의 마지막 full-width section에 둡니다.
- Diff는 기존 document drawer와 별도의 scaffold preview drawer로 열어 read model과 긴 diff의
  scroll ownership을 분리합니다.
- 기존 header의 `readOnly` badge는 worker health와 feature gate에 따라 `read-only`,
  `write-ready`, `recovering`, `degraded`로 바꿉니다. Gate off인 상태에서 실행 가능한 것처럼
  보이는 control을 노출하지 않습니다.

### State clarity와 operator error prevention

- Artifact row는 checkbox보다 먼저 create, marker-update, unchanged, conflict, skipped state와
  이유를 표시합니다.
- Conflict/unchanged artifact는 선택할 수 없고 conflict에는 수동 adoption 안내를 인접하게
  둡니다.
- Preview token 만료 시 confirm form을 즉시 disabled하고 input을 보존한 채 re-preview action을
  제공합니다.
- Exact confirmation은 입력해야 할 project 표시 이름을 form 바로 위에 text/code로 표시합니다.
- `committed/index-stale`는 write 실패처럼 표시하지 않고 refresh action을 제공합니다.
- `recovery-required`는 일반 toast에만 두지 않고 project detail 상단 persistent warning과
  action history 양쪽에 표시합니다.
- Rollback은 해당 receipt output fingerprint가 현재 target과 일치할 때만 enabled입니다.

### Layout, locale, accessibility

- Existing dense table/section language와 neutral token을 사용하고 nested card나 hero를 추가하지
  않습니다.
- Desktop은 artifact table과 detail drawer, mobile은 single-column list와 full-width drawer를
  사용합니다.
- Action button과 checkbox label은 가능한 44px touch target을 유지합니다.
- Diff와 path는 `word-break: keep-all` 예외이며 monospace와 horizontal scroll을 사용합니다.
- Status를 color만으로 구분하지 않고 icon, label과 reason code를 함께 표시합니다.
- 한국어와 영어 message bundle을 같은 change에서 추가하고 SSR locale hydration을 유지합니다.

## Blocking issue

없음. 위 결정은 spec의 Spec Freeze Snapshot과 implementation plan에 반영합니다.
