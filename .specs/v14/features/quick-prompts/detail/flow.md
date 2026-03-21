# 사용자 흐름

## 1. Quick Prompt 전송 흐름

```
1. Claude Code Panel 타임라인 뷰 표시 중
2. 입력창 위 suggestion 바에 Quick Prompt 버튼 표시
3. cliState 확인:
   a. idle → 버튼 활성
   b. busy/inactive → 버튼 비활성 (클릭 불가)
4. 사용자: 버튼 클릭 (예: "커밋하기")
5. prompt 문자열 읽기: "/commit-commands:commit"
6. 입력창(textarea)에 prompt 텍스트 채움 (기존 내용 대체)
7. 입력창에 포커스 이동
8. 사용자: 내용 확인/수정 후 Enter
9. 기존 입력창 전송 로직으로 PTY write
10. cliState → busy → suggestion 바 버튼 비활성화
11. 처리 완료 → idle → 버튼 재활성
```

## 2. 설정에서 프롬프트 추가 흐름

```
1. 설정 페이지/모달 → "빠른 프롬프트" 섹션
2. "+ 프롬프트 추가" 클릭
3. 폼 표시: 이름 + 프롬프트 입력
4. 입력 완료 → "저장" 클릭
5. 서버: PUT /api/quick-prompts → ~/.purple-terminal/quick-prompts.json 저장
6. 목록에 새 항목 추가 (enabled: true)
7. suggestion 바에 즉시 반영
```

## 3. 설정에서 프롬프트 수정 흐름

```
1. 기존 항목의 "수정" 버튼 클릭
2. 폼에 현재 이름/프롬프트 채워짐
3. 수정 후 "저장" 클릭
4. 서버: PUT /api/quick-prompts → 저장
5. suggestion 바에 즉시 반영 (이름 변경 시 버튼 텍스트 변경)
```

## 4. 설정에서 프롬프트 삭제 흐름

```
1. 항목의 "삭제" 버튼 클릭
2. 확인 없이 즉시 삭제 (단순 데이터이므로)
3. 서버: PUT /api/quick-prompts → 저장
4. suggestion 바에서 즉시 제거
5. 마지막 항목 삭제 시 suggestion 바 숨김
```

## 5. on/off 토글 흐름

```
1. 설정에서 항목의 Switch 토글
2. enabled 값 즉시 변경 (optimistic)
3. 서버: PUT /api/quick-prompts → 저장
4. enabled=false → suggestion 바에서 숨김
5. enabled=true → suggestion 바에 다시 표시
```

## 6. 기본값 초기화 흐름

```
1. "기본값으로 초기화" 클릭
2. 확인 다이얼로그: "모든 프롬프트를 기본값으로 초기화하시겠습니까?"
3. 확인 → 빌트인 "커밋하기" 1개만 남김 (커스텀 전부 삭제)
4. 서버: PUT /api/quick-prompts → 저장
5. suggestion 바 갱신
```

## 7. 초기 로드 흐름

```
1. Claude Code Panel 마운트
2. GET /api/quick-prompts → 목록 로드
3. 파일 없으면 → 빌트인 기본값 반환
4. enabled=true인 항목만 suggestion 바에 표시
```

## 8. 엣지 케이스

### 입력창에 텍스트 입력 중 Quick Prompt 클릭

```
입력창에 "테스트 해줘" 입력 중 → "커밋하기" 클릭
├── 입력창 텍스트가 "/commit-commands:commit"으로 대체
├── 포커스 이동
└── 사용자가 Enter로 전송 (기존 텍스트는 사라짐)
```

### Quick Prompts JSON 파일 손상

```
~/.purple-terminal/quick-prompts.json 파싱 실패
├── 빌트인 기본값으로 폴백
├── 에러 로그 (console.warn)
└── 사용자에게 에러 표시 안 함
```

### 프롬프트 텍스트가 매우 긴 경우

```
사용자가 설정에서 500자 프롬프트 입력
├── 그대로 PTY에 전송 (제한 없음)
├── Claude Code가 긴 텍스트를 정상 수신
└── 버튼 이름은 짧게 유지 (prompt과 별도)
```
