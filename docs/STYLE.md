# 스타일 가이드

codexmux UI는 운영 도구입니다. 화면은 조용하고 밀도 있게 구성하며, terminal/input/reconnect 안정성을 시각 장식보다 우선합니다.

## 원칙

- 제품 화면은 marketing hero처럼 만들지 않습니다.
- 정보는 scan 가능해야 합니다.
- Card 안에 card를 중첩하지 않습니다.
- Terminal, code, path, input, textarea, xterm 영역은 줄바꿈 예외로 둡니다.
- 긴 한국어 문장은 `word-break: keep-all`을 기본으로 하되, 경로나 코드에는 적용하지 않습니다.
- Hover, active, focus-visible 상태를 제공합니다.

## 테마

Theme token은 Tailwind CSS v4와 shadcn/ui conventions를 따릅니다. 새 색을 즉흥적으로 늘리지 않고 기존 token을 우선합니다.

## 로케일과 타이포그래피

- 기본 locale은 `ko`입니다.
- English UI message는 병행 유지합니다.
- SSR page는 저장된 locale로 message bundle과 `html lang`을 맞춥니다.
- 한국어 화면은 project font stack과 `word-break: keep-all`을 사용합니다.

## 모바일

- 가능한 touch target은 44px 이상으로 둡니다.
- Safe area를 고려합니다.
- Android WebView와 iPad Safari에서 input draft와 reconnect flow를 우선합니다.
- Terminal preview와 status recovery UI가 서로 가리지 않아야 합니다.

## 색상 토큰

Color는 상태 의미를 구분하는 데 사용합니다.

| 용도 | 기준 |
| --- | --- |
| 정상 | muted/neutral 기반 |
| 진행 | accent 또는 primary |
| 주의 | warning tone |
| 위험 | destructive tone |
| 비활성 | muted foreground |

단일 hue variation만으로 전체 화면을 만들지 않습니다. Purple/blue gradient, beige/sand, dark slate, brown/orange 계열이 화면 전체를 지배하지 않게 합니다.

## 차트 색상

Chart는 비교 가능한 색 대비를 사용합니다. 같은 계열 shade만 반복하지 않습니다.

## 금지 장식

- decorative orb
- gradient blob
- bokeh background
- 의미 없는 SVG hero
- floating section card
- nested card
- viewport width 기반 font scaling
- negative letter spacing

## 금지 패턴 예시

- 버튼 text가 container 밖으로 넘침
- icon 대신 text badge로 tool button을 채움
- terminal 위에 설명 text를 겹침
- dashboard를 landing page처럼 구성
- Windows 전용 제품 화면에 macOS/Linux 설치 안내를 primary로 노출
