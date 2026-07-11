# Production Security And Upload Integrity 설계

## 상태

- Lifecycle: brainstorming, domain-architecture, grill-me, plan-design-review 완료
- Written spec review: 사용자 승인 (2026-07-11)
- 사용자 설계 승인: 2026-07-11
- 구현 상태: 구현 및 Linux dev/prod 검증 완료, fresh Windows 증거 pending
- 관련 감사: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- 선행 결정: ADR-001, ADR-004, ADR-005, ADR-026
- ADR: ADR-027 Implemented

## 문제

Purplemux 비교 감사에서 pre-auth bootstrap 다음의 production P0로 dependency
advisory와 upload truncation이 확인됐습니다. 두 문제는 모두 현재 Next.js runtime과
custom server 경계에 닿지만 변경 원인과 rollback 단위는 다릅니다.

### Production dependency security baseline

2026-07-11에 `corepack pnpm audit --prod`를 다시 실행한 결과는 다음과 같습니다.

| Package group | Findings | Current | Minimum patched | Reachability |
| --- | ---: | --- | --- | --- |
| `next` | 13 | `16.2.4` | `16.2.6` | Pages Router+i18n proxy, protected dynamic API, authenticated unknown WebSocket에서 도달 |
| `ws` | 2 | `8.20.0` | `8.21.0` | 여섯 WebSocket server가 직접 사용 |
| `next-intl`, `icu-minify` | 2 | `4.9.1` | `4.9.2` | 현재 precompile 미사용으로 비도달, production graph에는 포함 |
| `postcss` | 1 | `8.4.31` | `8.5.10` | 신뢰된 build input에 한정 |
| `js-yaml` | 1 | `4.1.1` | `4.2.0` | Electron updater metadata parsing에서 도달 |
| `@babel/core` | 1 | `7.29.0` | `7.29.6` | 신뢰된 build input에 한정 |

합계는 High 8, Moderate 8, Low 4입니다. Next `16.2.6`도 PostCSS
`8.4.31`을 exact dependency로 선언하고 `styled-jsx`가 기존 Babel resolution을
유지하므로 두 transitive package에는 제한된 pnpm override가 필요합니다.

### Upload truncation

현재 browser client는 image를 최대 10MiB, generic file을 최대 50MiB의 raw body로
`/api/upload-image`, `/api/upload-file`에 보냅니다. 두 Pages API route는
`bodyParser: false`를 사용하고 전체 body를 메모리에 모은 뒤 저장합니다. 두 경로 모두
`src/proxy.ts` matcher를 통과하므로 Next는 proxy 실행을 위해 body를 복제합니다.

Next `16.2.4`의 `experimental.proxyClientMaxBodySize` 기본값은 10MiB입니다. 제한을
넘긴 chunk를 받으면 Next는 error response를 만들지 않고 clone stream을 닫으며,
crossing chunk 전체를 버립니다. API route는 잘린 stream을 정상 EOF로 인식해 partial
artifact를 성공으로 저장합니다.

Production 실재현 결과:

| Case | Original | HTTP | Stored |
| --- | ---: | ---: | ---: |
| Generic file | 11,534,336B | 200 | 10,444,800B |
| Image exact limit | 10,485,760B | 200 | 10,485,760B |
| Image over by one | 10,485,761B | 200 | 10,444,800B |

Raw File body이므로 HTTP header나 multipart overhead는 payload limit에 포함되지
않습니다. 문제는 exact 10MiB boundary가 아니라 proxy clone과 route ownership입니다.

## 목표

1. Production dependency audit를 ignore나 mute 없이 0건으로 만듭니다.
2. 보안 패치는 minimum patched version으로 제한하고 unrelated dependency upgrade를
   포함하지 않습니다.
3. Next와 `eslint-config-next` version을 맞추고 lockfile graph를 검증합니다.
   Next가 실제 지원하는 범위에 맞춰 manifest Node engine 하한도 `>=20.9.0`으로
   정합화합니다.
4. `/api/upload-image`와 `/api/upload-file`의 외부 HTTP ingress를 outer custom
   server가 단독 소유하게 합니다.
5. Upload ingress는 기존 session cookie와 CLI token 의미를 유지하고 application이
   request data를 subscribe/pipe하거나 staged file을 만들기 전에 인증합니다.
6. Browser session 요청은 strict single Host와 same-authority Origin을 요구합니다.
   CLI token 요청은 Origin을 생략할 수 있으며, Origin이 있으면 same-authority여야 합니다.
7. Upload는 canonical Content-Length와 application-observed request byte가 일치할 때만
   성공합니다.
8. Image 10MiB와 generic file 50MiB exact limit은 성공하고 1 byte 초과는 final
   artifact 없이 `413`을 반환합니다.
9. Body를 크기에 비례해 heap에 모으지 않고 same-directory staged file로 streaming한
   뒤 atomic no-replace hard-link publish를 수행합니다.
10. Active transaction, reserved byte와 shutdown/abort cleanup의 ownership을 한 outer
    server instance가 관리합니다.
11. 기존 성공 response `{ path, filename }`, upload directory layout, client attachment
    flow를 유지합니다.
12. Dependency checkpoint와 upload checkpoint를 독립 검증하고 forward rollback할 수
    있게 합니다.

## 비목표

- Upload UI, toast copy, attachment chip layout 변경
- Generic file 50MiB 또는 image 10MiB product limit 확대
- Multipart upload, resumable upload, remote object storage 추가
- Virus scanning, content inspection, image decoding validation 추가
- Tailscale/reverse proxy의 forwarded header trust contract 추가
- Session cookie format이나 CLI token lifecycle 변경
- Next App Router 또는 별도 upload service 도입
- 다른 API request body의 streaming 전환
- Windows ACL 또는 code signing 정책 재설계

## 선택한 접근

### 1. Production dependency security baseline

최소 patched version을 사용합니다.

```json
{
  "next": "16.2.6",
  "next-intl": "4.9.2",
  "ws": "8.21.0",
  "eslint-config-next": "16.2.6",
  "js-yaml": "4.2.0"
}
```

Next `16.2.4`와 `16.2.6` 모두 Node `>=20.9.0`을 요구하므로 repository manifest의
기존 과소 선언도 이번 checkpoint에서 `"node": ">=20.9.0"`으로 바로잡습니다.

pnpm override는 Next가 patched transitive version을 아직 선언하지 않은 두 package로
제한합니다.

```json
{
  "postcss@<8.5.10": "8.5.10",
  "@babel/core@<=7.29.0": "7.29.6",
  "next-intl@4.9.2>use-intl": "4.9.2",
  "next-intl@4.9.2>icu-minify": "4.9.2",
  "next-intl@4.9.2>next-intl-swc-plugin-extractor": "4.9.2",
  "use-intl@4.9.2>icu-minify": "4.9.2"
}
```

`electron-updater`, Electron, React, Tailwind, Capacitor와 다른 outdated package는 이
checkpoint에서 올리지 않습니다. `js-yaml` direct pin을 올리면
`electron-updater@6.8.3`의 `^4.1.0` dependency도 같은 patched version으로
dedupe됩니다.

첫 두 override는 vulnerable range에만 적용합니다. 나머지 네 parent-scoped pin은
`next-intl@4.9.2`가 내부 suite를 `^4.9.2`로 선언해 lockfile 재해석 때 4.13.x가 섞이는
것을 막습니다.

Dependency checkpoint는 upload source를 수정하기 전에 다음을 만족해야 합니다. Exact
direct pin, vulnerable-range override와 next-intl family pin을 사용해 lockfile 재생성이
unrelated minor upgrade를 끌어오지 않게 합니다.

- `corepack pnpm audit --prod`: 0 findings
- `corepack pnpm why --prod next next-intl use-intl icu-minify next-intl-swc-plugin-extractor postcss ws js-yaml @babel/core`: intended graph
- auth/proxy/WebSocket focused regression
- lint, typecheck, full unit, Next standalone build

Audit가 새 registry advisory로 다시 실패하면 무시 규칙을 추가하지 않고 blocker로
재분류합니다. Rollback은 vulnerable version으로 되돌리는 것이 아니라 다른 patched
version으로 전진합니다.

### 2. Authenticated upload ingress

Upload request는 Next request handler보다 먼저 분기합니다.

```text
raw upload route classifier and socket quarantine
  -> outer HTTP source/bootstrap guard
  -> strict Host validation
  -> session or CLI credential authorization
  -> credential-specific Origin validation
  -> method validation
  -> upload policy and Content-Length validation
  -> bounded admission reservation or immediate 429
  -> optional 100 Continue
  -> same-directory staged file streaming
  -> received byte verification
  -> close + atomic no-replace hard-link publish
  -> upload receipt
```

Development에서는 `app.getRequestHandler()` 전에, production에서는 internal standalone
proxy 전에 동일한 `uploadServer.handleRequest()`를 호출합니다. Exact pathname이 아닌
request는 기존 Next handler/proxy로 그대로 전달합니다.

기존 `src/pages/api/upload-image.ts`와 `src/pages/api/upload-file.ts`는 제거합니다.
Custom server가 product runtime의 필수 경계라는 ADR-001에 따라 external upload
owner를 하나만 둡니다. Internal standalone port나 unsupported direct `next dev`에는
upload API를 별도로 노출하지 않습니다.

`experimental.proxyClientMaxBodySize`를 올리지 않습니다. Upload request가 Next proxy에
도달하지 않으므로 global proxy body clone cap과 다른 POST route의 clone behavior는
그대로 유지됩니다.

`CODEXMUX_UPLOADS_DISABLED=1`은 exact upload route를 body consumption 전에
`503 uploads-disabled`로 닫는 operational kill switch입니다. 이 상태에서도 request를
Next/제거된 Pages route로 넘기지 않습니다. 다른 HTTP/WebSocket surface는 그대로
동작합니다.

## Domain Architecture

### 기준 용어

| Term | Meaning |
| --- | --- |
| Upload ingress | 두 external HTTP upload route의 request admission boundary |
| Upload transaction | 한 admitted request가 staged file을 commit 또는 abort하는 lifecycle |
| Upload artifact | `~/.codexmux/uploads/`에 commit된 final file |
| Upload policy | route kind별 MIME, maximum bytes, required header contract |
| Upload receipt | 기존 `{ path, filename }` success response |
| Reservation lease | active transaction이 admission 전에 점유하는 owner token과 declared byte budget |

거부 용어:

- `proxy upload`: Next proxy가 domain owner라는 잘못된 인상을 주므로 사용하지 않습니다.
- `multipart upload`: request body는 raw file입니다.
- `upload session`: auth session 또는 Codex session과 혼동되므로 사용하지 않습니다.
- `upload cache`: committed artifact는 TTL cleanup 대상이지만 cache hit contract가 없습니다.
- `temporary artifact`: artifact는 committed final file만 뜻합니다. Commit 전 파일은 staged
  file로 부릅니다.

### Bounded context와 module

```text
Upload Request Contract
  src/lib/upload-request-contract.ts
    raw request-target, header and route policy parsing

Upload Request Auth Adapter
  src/lib/upload-request-auth.ts
    upload-scoped credential verification and session refresh intent

Upload Admission Service
  src/lib/upload-admission.ts
    active count, byte budget and owner-specific reservation lease

Upload Ingress
  src/lib/upload-server.ts
    HTTP orchestration, response, Expect handling and shutdown

Outer HTTP Dispatcher
  src/lib/server-http-dispatcher.ts
    unified HTTP events, socket quarantine and Next fallthrough

Upload Storage Adapter
  src/lib/uploads-store.ts
    path generation, temp stream, byte count, atomic commit, cleanup

Composition Root
  server.ts
    one upload server instance, unified HTTP event routing and socket quarantine
```

`UploadServer`는 process-scoped application coordinator입니다. Active transaction,
reserved bytes와 shutdown state를 소유합니다. `UploadTransaction`은 request-scoped state
machine입니다. Exact-once identity는 reservation lease가 가지며 owner id, abort signal과
idempotent release를 제공합니다. `UploadPolicy`와 `UploadReceipt`는 value type입니다.

Shared `globalThis` state를 만들지 않습니다. Mutable admission과 transaction state는 outer
custom server module graph 하나가 소유합니다. Stateless filesystem cleanup primitive는
기존 authenticated cleanup API의 Next module graph에서도 사용할 수 있습니다.

### 공개 type과 signature

```typescript
type TUploadKind = 'image' | 'file';

type TUploadPolicy = {
  kind: TUploadKind;
  pathname: '/api/upload-image' | '/api/upload-file';
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string> | null;
};

type TUploadReceipt = {
  path: string;
  filename: string;
};

interface ICleanupResult {
  deleted: number;
  freedBytes: number;
}

type TUploadErrorCode =
  | 'invalid-upload-target'
  | 'invalid-upload-request'
  | 'invalid-credential'
  | 'origin-forbidden'
  | 'method-not-allowed'
  | 'upload-timeout'
  | 'length-required'
  | 'payload-too-large'
  | 'unsupported-expectation'
  | 'upload-capacity-exhausted'
  | 'storage-failure'
  | 'auth-unavailable'
  | 'uploads-disabled'
  | 'upload-server-shutting-down';

type TUploadRouteMatch =
  | { matched: false }
  | { matched: true; valid: false; statusCode: 400; reason: 'invalid-upload-target' }
  | { matched: true; valid: true; policy: TUploadPolicy };

type TUploadRequestAuthorization =
  | { authorized: true; credential: { kind: 'cli' }; refreshSession: false }
  | {
      authorized: true;
      credential: { kind: 'session'; expiresAtEpochSeconds: number };
      refreshSession: boolean;
    }
  | {
      authorized: false;
      statusCode: 400 | 401 | 503;
      reason: 'invalid-upload-request' | 'invalid-credential' | 'auth-unavailable';
    };

interface IUploadReservationLease {
  ownerId: symbol;
  signal: AbortSignal;
  release: () => void;
}

interface IUploadAdmissionService {
  reserve: (declaredBytes: number) => TUploadAdmissionResult;
  shutdown: () => void;
}

type TUploadAdmissionResult =
  | { admitted: true; lease: IUploadReservationLease }
  | {
      admitted: false;
      statusCode: 429 | 503;
      reason: 'upload-capacity-exhausted' | 'upload-server-shutting-down';
    };

type TUploadTransactionResult =
  | { committed: true; receipt: TUploadReceipt }
  | {
      committed: false;
      statusCode: 400 | 408 | 413 | 500 | 503;
      reason:
        | 'upload-aborted'
        | 'upload-timeout'
        | 'length-mismatch'
        | 'payload-too-large'
        | 'storage-failure'
        | 'upload-server-shutting-down';
      cleanup: 'complete' | 'failed' | 'not-required';
    };

interface IUploadRequestAuthorizationInput {
  headers: IncomingMessage['headers'];
  rawHeaders: IncomingMessage['rawHeaders'];
}

interface IUploadBodySource extends NodeJS.ReadableStream {
  complete: boolean;
}

interface IStreamUploadArtifactInput {
  source: IUploadBodySource;
  policy: TUploadPolicy;
  declaredBytes: number;
  mime: string | null;
  originalName?: string;
  workspaceId?: string;
  tabId?: string;
  signal: AbortSignal;
  onProgress: () => void;
}

interface IUploadClock {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeout: (timer: NodeJS.Timeout) => void;
}

interface IUploadServerOptions {
  authorizeRequest: (
    input: IUploadRequestAuthorizationInput,
  ) => Promise<TUploadRequestAuthorization>;
  admission: IUploadAdmissionService;
  streamArtifact: (
    input: IStreamUploadArtifactInput,
  ) => Promise<TUploadTransactionResult>;
  createSessionRefreshHeader: (secure: boolean) => Promise<string>;
  cleanupStaleParts: () => Promise<ICleanupResult>;
  clock: IUploadClock;
  disabled: boolean;
}

interface IUploadServer {
  classify(request: Pick<IncomingMessage, 'url'>): TUploadRouteMatch;
  start(): Promise<void>;
  handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    options: { expectContinue: boolean },
  ): Promise<void>;
  handleUpgradeAttempt(request: IncomingMessage, socket: Duplex): Promise<void>;
  beginShutdown(): void;
  shutdown(): Promise<void>;
}

const createUploadServer = (options: IUploadServerOptions): IUploadServer;

const authorizeUploadRequest = async (
  input: IUploadRequestAuthorizationInput,
): Promise<TUploadRequestAuthorization>;

const streamUploadArtifact = async (
  input: IStreamUploadArtifactInput,
): Promise<TUploadTransactionResult>;
```

Expected rejection과 cleanup state는 위 discriminated result로 전달합니다. Unexpected
programming error만 composition root의 final catch로 전달하며 process-level unhandled
rejection이 되지 않습니다.

### Adapter 경계

`IncomingMessage`/`ServerResponse`, filesystem stream, clock/random id와 credential verifier는
infrastructure dependency입니다. Unit test는 request stream, response, storage writer와
authorizer를 주입합니다. Filesystem integration test는 real temporary HOME을 사용합니다.

Final publish는 staged file과 같은 directory 및 volume에서 `fs.link(stage, final)`로
수행합니다. Staged file은 `flags: 'wx'`, `mode: 0o600`으로 만들고 writer handle을 닫은
뒤 link를 생성하며, destination이 이미 있으면 새 final name으로 재시도합니다.
POSIX mode는 best effort이고 Windows ACL 보장을 의미하지 않습니다. Product security는
기존 user-scoped data directory contract를 유지합니다.

### ADR

ADR-027 Implemented:

> 인증된 대용량 upload ingress는 Next proxy/API route가 아니라 outer custom server가
> 소유하고, bounded streaming과 same-directory atomic commit을 사용한다.

이 결정은 custom server 책임을 장기적으로 확대하고, framework route만 보면 놀라우며,
auth ownership과 memory integrity 사이의 실제 trade-off가 있어 별도 ADR 조건을
충족합니다. Dependency patch 자체는 ADR이 아니라 maintenance입니다.

## Request Contract

### Route와 method

Outer server는 WHATWG URL 정규화 전의 raw origin-form request-target을 분류하고 아래 두
ASCII pathname만 처리합니다.

- `/api/upload-image`
- `/api/upload-file`

첫 `?` 뒤 query string은 현재처럼 무시합니다. Raw path는 percent decode하지 않습니다.
Absolute-form, authority-form, control character, backslash, fragment, encoded delimiter,
encoded/dot segment 또는 WHATWG 정규화 뒤에만 exact upload path가 되는 target은
`invalid-upload-target` 400입니다. Prefix, suffix, locale prefix와 trailing slash는 upload로
match하지 않고 Next로 전달되며, 제거된 Pages upload route 대신 기존 protected 404 흐름을
따릅니다. Upload route의 `POST` 외 method는 valid credential과 Origin 확인 뒤
`Allow: POST`와 `405`를 반환합니다.

위 authority-form 400은 classifier에 직접 전달되는 synthetic request-target contract입니다.
Proper wire-level `CONNECT`는 Node의 별도 `connect` event이며 listener를 등록하지 않아
connection close로 fail closed합니다. CONNECT는 upload/Next handler나 stable JSON response
surface가 아닙니다.

### Credential과 authority

검증 순서는 strict single Host, credential, credential별 Origin, method, framing/policy입니다.
Credential은 기존 proxy와 같이 valid CLI token을 먼저 확인한 뒤 session cookie를
확인합니다. Invalid CLI token과 valid session이 함께 있으면 session을 사용할 수 있고,
둘 다 valid이면 CLI credential이 우선합니다.

| Credential | Origin absent | Same-authority Origin | Other Origin |
| --- | --- | --- | --- |
| Valid CLI token | allow | allow | reject 403 |
| Valid session | reject 403 | allow | reject 403 |
| Missing/invalid | reject 401 | reject 401 | reject 401 |

모든 request는 strict single Host를 가져야 합니다. Session request와 Origin이 있는 CLI
request는 `validateBrowserRequestAuthority()`를 재사용합니다. Valid 결과는 request
protocol을 함께 반환하도록 확장해 HTTPS session refresh cookie를 보존합니다. Forwarded
Host/Proto는 authority 판단에 사용하지 않습니다.

Auth dependency/config read failure는 `503`이고 invalid credential은 `401`입니다. Response와
log에 token, cookie, original filename, path를 포함하지 않습니다.

Session token의 남은 수명이 `MAX_AGE / 2`보다 짧으면 기존 proxy와 동일하게 새 token을
서명하고 `Set-Cookie`를 설정합니다. Refresh intent는 authorization result에 포함되고,
Origin 검증 뒤 body admission 전에 materialize합니다. 서명 실패는 body를 읽지 않고
`503`입니다. CLI credential은 session refresh를 만들지 않습니다.

### Header와 byte policy

`Content-Length`는 정확히 하나의 canonical decimal positive integer여야 합니다.

- missing: `411 Length Required`
- duplicate, sign, leading zero, non-decimal, unsafe integer: `400`
- zero: `400`
- policy maximum 초과: `413`
- stream 완료 뒤 observed bytes 불일치 또는 `request.complete !== true`: `400`

`Transfer-Encoding`은 허용하지 않고 `Content-Length`와 함께 온 경우를 포함해 400으로
거부합니다. Node parser가 callback 전에 CL/TE ambiguity를 거부하는 raw socket case도
동일한 실패 계약으로 테스트합니다. `Content-Encoding`은 absent 또는 single `identity`만
허용합니다.

HTTP field-value의 optional whitespace는 Node parser가 `IncomingMessage`를 만들기 전에
제거하므로 upload contract는 parser-normalized Content-Length를 검증합니다. Wire-level OWS
유무를 application rejection reason으로 구분하지 않습니다.

Image는 single `Content-Type`의 media type이 `image/png`, `image/jpeg`, `image/gif`,
`image/webp`일 때만 허용합니다. Generic file은 기존처럼 MIME allowlist를 두지 않지만
duplicate Content-Type은 거부합니다. Cookie, CLI token, filename, workspace id, tab id
header는 duplicate value를 거부합니다. Filename percent decoding failure는 `400`입니다.
Omitted filename과 ids는 기존 generated fallback을 사용합니다.
한 Cookie field 안에 `session-token` pair가 둘 이상인 경우도 structural ambiguity로 400입니다.

Node HTTP parser가 application stream에 전달하는 request body는 declared
`Content-Length`로 framing됩니다. Declared length보다 뒤에 붙은 octet은 이 request의 body가
아니며 application byte counter로 검출할 수 없습니다. Upload response는 성공을 포함해
항상 `Connection: close`를 사용합니다. Exact upload가 시작되면 composition root는 socket과
첫 `IncomingMessage`를 WeakMap quarantine owner로 연결하고 socket `close`까지 유지합니다.
Node parser가 같은 packet의 extra octet을 두 번째 request로 emit해도 unified composition
function은 owner가 아닌 request를 pause하고 dispatch하지 않습니다. Shared socket은 첫 upload
response가 완전히 finish된 뒤 owner의 `Connection: close`로 닫습니다. 후속 request의 즉시
socket destroy가 첫 response flush를 중단해서는 안 됩니다.
Declared length보다 짧은 transport, abort와 incomplete request만 application equality
check로 거부합니다.

### Expect와 unread body

Outer server는 `checkContinue` listener를 등록하고 일반 request callback과 같은 route,
Host, credential, Origin, method, framing, policy, admission pipeline을 사용합니다. Exact
upload request는 모든 pre-body gate와 reservation이 성공한 뒤에만 `writeContinue()`를
호출합니다. Non-upload `checkContinue`는 outer가 한 번만 100을 보내고 Expect를 제거한 뒤
기존 handler로 전달합니다. `checkExpectation`은 upload/non-upload 모두 Node의 기존 의미인
`417` final response로 닫고 fallback하지 않습니다.

Protocol-switch `upgrade` event도 raw classifier와 outer source/bootstrap guard를 먼저
통과합니다. Exact 또는 normalization-only upload target의 upgrade attempt는 disabled/shutdown
상태에서는 503, 그 외에는 invalid transport 400으로 닫고 existing WebSocket/Next fallback에
전달하지 않습니다. `connect` event는 listener 없는 Node fail-closed 의미를 유지하며
upload/Next handler로 dispatch되지 않습니다.

Body를 읽기 전의 모든 upload rejection은 final JSON response에 `Connection: close`를
설정하고 response `finish` 뒤 socket을 닫습니다. 즉시 `request.destroy()`해서 4xx response를
유실하지 않습니다. Accepted upload의 abort/error도 response 가능 여부를 확인한 뒤 close하며,
이미 닫힌 response에 다시 write하지 않습니다.

### Status contract

| Status | Meaning |
| ---: | --- |
| 200 | artifact committed and receipt returned |
| 400 | malformed route input, header, MIME, filename encoding, empty/mismatched body |
| 401 | missing or invalid credential |
| 403 | Origin missing for session or authority mismatch |
| 405 | exact upload path with non-POST method |
| 408 | active upload idle 또는 absolute timeout |
| 411 | Content-Length missing |
| 413 | declared or observed byte limit exceeded |
| 417 | unsupported Expect header |
| 429 | active count 또는 reserved byte capacity exhausted |
| 500 | unexpected write, close, publish 또는 cleanup storage failure |
| 503 | auth dependency unavailable, upload disabled 또는 server shutting down |

Response body는 additive `{ "code": TUploadErrorCode, "error": string }` 형태를
사용합니다. Existing `error` field와 10/50MiB limit message는 유지하고 current client는
새 `code`를 무시할 수 있습니다. Stable mapping은 다음과 같습니다.

| Code | Status | `error` |
| --- | ---: | --- |
| `invalid-upload-target` | 400 | `Invalid upload target` |
| `invalid-upload-request` | 400 | `Invalid upload request` |
| `invalid-credential` | 401 | `Unauthorized` |
| `origin-forbidden` | 403 | `Forbidden` |
| `method-not-allowed` | 405 | `Method not allowed` |
| `upload-timeout` | 408 | `Upload timed out` |
| `length-required` | 411 | `Content-Length required` |
| `payload-too-large` | 413 | existing policy-specific `Image exceeds 10MB` or `File exceeds 50MB` |
| `unsupported-expectation` | 417 | `Unsupported Expect header` |
| `upload-capacity-exhausted` | 429 | `Upload is busy. Try again.` |
| `storage-failure` | 500 | existing policy-specific `Failed to save image` or `Failed to save file` |
| `auth-unavailable` | 503 | `Upload unavailable` |
| `uploads-disabled` | 503 | `Upload unavailable` |
| `upload-server-shutting-down` | 503 | `Upload unavailable` |

Log에는 code만 사용합니다. Client는 현재처럼 `error` field를 표시하므로 locale/UI 변경은
없습니다.

Pre-commit staged unlink가 bounded retry 후에도 실패하면 원래 abort/length/timeout reason보다
`storage-failure` 500이 우선합니다. Node parser나 requestTimeout이 application callback 전에
connection을 거부한 400/408은 stable upload JSON contract 밖이지만 upload/Next fallback에는
도달하지 않습니다.

## Admission And Transaction Lifecycle

### Bounded admission

한 outer server instance의 기본 budget:

- active transactions: 8
- total declared bytes reserved by active transactions: 200MiB
- pending admissions: 0
- active idle timeout: 60 seconds
- active absolute timeout: 270 seconds

Content-Length 검증 후 admission을 요청합니다. Active count와 byte budget이 모두 허용할
때 owner token을 발급하고 declared bytes를 reserve합니다. Capacity가 부족하면 body를
읽거나 100 Continue를 보내지 않고 즉시 `429`와 `Retry-After: 1`을 반환합니다. P0 범위에는
pending queue, promotion, head-of-line 정책을 넣지 않습니다.

Reservation은 owner-specific하고 commit, abort, error, timeout, shutdown 중 어느 경로에서도
정확히 한 번 release됩니다. Application이 request data를 subscribe/pipe하거나 staged file을
만들기 전에 인증과 admission을 완료합니다.
Idle timeout은 socket에 새 body byte가 없는 시간을, absolute timeout은 admission부터
terminal state까지를 측정합니다. Node 기본 `requestTimeout`은 첫 request byte부터
측정되므로 slow header에서는 300초 server timeout이 270초 admission timer보다 먼저
connection을 닫을 수 있습니다. 이 경우 request abort/incomplete 경로가 동일한 staged-file
cleanup과 lease release를 소유합니다. UploadServer timer가 먼저 발화한 경우 가능한 한
`408`을 반환합니다. Global server timeout은 올리지 않습니다.

### Streaming commit

```text
admitted
  -> create sanitized directory
  -> create same-directory staged .<32-hex>.upload.part file with flags=wx and mode=0o600
  -> pipeline request through byte counter into file stream
  -> require observed bytes == declared bytes and request.complete
  -> close file stream
  -> hard-link staged file to generated final filename with no replacement
  -> unlink staged path
  -> committed receipt
```

The byte counter keeps a defensive upper bound for injected streams, while real HTTP framing uses
Content-Length as the request boundary. Request `aborted`, incomplete request, stream error, write
error, short body, timeout and pre-commit publish failure all transition exactly once to `aborted`,
unlink the staged file best effort, release reservation and never return 200.

Successful hard-link creation is the linearization point from staged file to upload artifact. Before
publish, disconnect or shutdown deletes the staged file. After publish succeeds, response disconnect does not
delete the committed artifact; only receipt delivery failed and normal TTL cleanup owns the orphan.
Request abort, response close, writer error, timeout and shutdown compete through one terminal-state
transition.

Final filename remains server-generated and contains 128 bits of randomness. The storage adapter
checks the generated target within the process and regenerates on collision so it never
intentionally overwrite an existing artifact. Staged and final names are in the same directory so
hard-link publication is same-volume. Writer close is awaited before publish. Windows
`EPERM`/`EBUSY` close, link and unlink races use four bounded retries at 25, 50, 100 and 200ms.
Pre-commit exhaustion returns sanitized storage failure. Once the hard link exists, it is the commit
point; a failed staged-path unlink leaves only a reserved stale link for later cleanup and does not
report the committed artifact as lost.

Committed cleanup and manual `cleanupAllUploads()` exclude only the strict reserved
`.<32-hex>.upload.part` staged namespace. A legitimate committed generic file whose extension is
`.part` remains a final artifact and follows normal TTL/all cleanup. A separate staged-file cleanup
primitive always has a 30-minute minimum age, maximum transaction duration보다 충분히 긴
floor입니다. Removal accounting separates `removed` from byte size so a zero-byte stale staged
file counts as one deletion with zero freed bytes.
`start()`은 stale-part cleanup을 한 번 실행하고 실패를 sanitized warning으로 격리한 뒤,
unref된 recursive 30-minute timer를 등록합니다. Each interval and manual cleanup delete only
staged files older than that floor. The age floor also protects an overlapping process if the existing
health-based lock recovery temporarily misclassifies a live owner. This stateless storage primitive
may run from the existing cleanup API without sharing mutable admission state. The maintenance
timer is cleared during upload server shutdown.

Upload server shutdown order is: `beginShutdown()`으로 mark shutting down, stop the outer listener
from accepting new requests by starting a callback-backed `server.close()` promise, then
`shutdown()`으로 active leases를 abort하고 writer close/unlink와 모든 lease release를
await합니다. Node의 close callback은 active upgraded socket이 남아 있으면 완료되지 않으므로
기존 runtime/WebSocket shutdown을 실행하고 짧은 grace period 뒤 남은 WebSocket clients와
dispatcher가 추적한 모든 upgraded sockets를 terminate합니다. 그 다음
`server.closeAllConnections()`로 남은 stalled/half-open ordinary HTTP connections를 종료하고,
마지막에 close promise를 await합니다. `closeAllConnections()`는 upgraded sockets를 닫지
않으므로 두 termination 단계의 순서는 대체할 수 없습니다. The composition root immediately
catches every promise created by request, Expect, upload upgrade and fallback event handlers; it never
relies on EventEmitter awaiting an async listener. Existing Next upgrade fallback도 반환 Promise를
반드시 await합니다. Unexpected rejection closes fail-safe without an unhandled process rejection.

Normal `request`, `checkContinue` and `checkExpectation` events enter one composition function. It
first runs the pure raw-target classifier only to quarantine a matching upload socket, then runs the
outer source/bootstrap guard before any upload auth, body subscription or storage action. Outer
rejection with an unread body also uses final response plus `Connection: close`. After a non-upload
`checkContinue` request passes the outer guard, the outer server sends the single 100 response,
removes the `Expect` header and only then calls the existing dev handler or production proxy so the
internal server cannot emit a second 100 response. Non-upload `checkExpectation` returns 417 without
fallback.

## Data Flow

### Development

```text
browser/Electron/Android/CLI
  -> outer Node HTTP server
  -> raw upload match/quarantine
  -> bootstrap/source guard
  -> matched upload
     -> authenticated streaming upload
     -> response
  -> otherwise Next dev handler
```

### Production

```text
browser/Electron/Android/CLI
  -> outer Node HTTP server
  -> raw upload match/quarantine
  -> bootstrap/source guard
  -> matched upload
     -> authenticated streaming upload
     -> response
  -> otherwise proxy to loopback standalone Next
```

Upload request는 production internal Next port, Next proxy, Pages API route에 도달하지
않습니다. 성공 response와 final artifact layout은 development와 production에서 같습니다.

## Failure And Logging Policy

- Rejection reason은 enum/low-cardinality label로 log합니다.
- Credential, cookie, token, body, original filename, generated full path, workspace/tab id는
  log하지 않습니다.
- Expected 4xx는 warn/error stack을 남기지 않습니다.
- Storage/stream dependency failure만 sanitized error label로 기록합니다.
- Response가 이미 종료되었거나 socket이 닫힌 경우 다시 write하지 않습니다.
- Cleanup failure는 artifact path 없이 counter/reason만 기록합니다.

## Test Strategy

### Dependency checkpoint

Run:

```bash
corepack pnpm audit --prod
corepack pnpm why --prod next next-intl use-intl icu-minify next-intl-swc-plugin-extractor postcss ws js-yaml @babel/core
corepack pnpm exec vitest run tests/unit/proxy-config.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts tests/unit/lib/install-server.test.ts tests/unit/electron/windows-updater-http.test.ts
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
corepack pnpm smoke:browser-reconnect
corepack pnpm build:electron
xvfb-run -a corepack pnpm smoke:electron:runtime-v2
```

Production black-box auth smoke obtains the fresh build id and asserts unauthenticated
`/_next/data/<buildId>/index.json` rejection. A protected dynamic API request sends external
`nxtPpaneId`/`nxtPtabId` values that conflict with the visible path and must remain `401`.
Authenticated unknown WebSocket upgrade must not proxy an attacker-selected destination.

### Upload unit and integration

- exact raw origin-form route matches; absolute-form, dot/encoded segment and backslash target reject
- POST only and existing Next fallthrough for non-upload path
- valid session, valid CLI, invalid/missing credential
- session missing/attacker Origin, CLI absent/same/attacker Origin
- invalid CLI plus valid session, dual-valid CLI precedence and rolling session refresh
- duplicate/malformed Host, Origin, Cookie, CLI token, Content-Length, Content-Type and metadata headers
- `Expect: 100-continue` receives no interim 100 before authorization/admission
- source/bootstrap rejection on normal and Expect upload closes after the final response
- non-upload `checkContinue` receives exactly one 100 and reaches Next without an Expect header
- non-upload `checkExpectation` preserves 417 and never reaches Next
- Transfer-Encoding, CL+TE, non-identity Content-Encoding and unsupported Expect rejection
- exact image 10MiB and file 50MiB commit
- limit+1, zero, short, incomplete and aborted requests leave no final/staged file after successful cleanup
- injected unlink retry exhaustion returns `cleanup: failed`, leaves no final artifact and leaves the staged file for age-based cleanup
- valid 37MiB artifact has exact size and SHA-256 parity
- invalid MIME and malformed percent-encoded filename return 400
- active count and byte reservation overflow return immediate 429 without consuming body
- idle/absolute timeout, abort and shutdown release each lease exactly once
- active staged file survives manual final-artifact cleanup; startup/stale cleanup obey ownership
- publish-before/after disconnect, Windows retry and repeated cleanup do not crash process
- staged and final POSIX mode is 0o600
- successful and rejected upload response closes the connection; socket quarantine pauses a second
  request without disrupting the first response and prevents it from reaching Next
- exact/normalization-only upload upgrade attempt never reaches WebSocket/Next fallback
- slow-header Node timeout and application timeout both leave no staged file or lease
- `CODEXMUX_UPLOADS_DISABLED=1` returns 503 and never falls through to Next
- internal standalone port has no Pages upload route
- no `Buffer.concat` or full-body chunk array remains on the upload path
- isolated 50MiB streaming storage test keeps peak external-memory growth below 16MiB

Large boundary tests use generated/repeated stream chunks and temporary files rather than keeping
multiple 50MiB Buffers in the test process.

The external-memory gate runs one bare real-HTTP known-good control, one production-path known-bad
negative control and three positive processes through `scripts/check-upload-stream-memory.ts`. The package script invokes
`node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts` directly so
Node 20 versions that reject `--expose-gc` in `NODE_OPTIONS` remain supported. The flag follows the
tsx CLI entrypoint because tsx 4.21 forwards that position to its re-executed Node process; placing
the flag before the entrypoint leaves `global.gc` unavailable. Each measured process
creates a temporary root, sets `HOME` and `USERPROFILE`, then dynamically imports
UploadServer/uploads-store before starting the real local HTTP server and spawning the same script
in client mode. It closes server/child handles and removes that temporary tree in `finally` on every
outcome, so the developer's real `~/.codexmux/uploads` is never touched.
The client reuses one 64KiB Buffer for exactly 800 backpressure-driven writes, while the HTTP parser
creates distinct server-side body chunks. The server calls `global.gc()` three times before
admission and before every measurement, records live `process.memoryUsage().external` after every
16 progress callbacks and after commit, and verifies output size/SHA-256. Production mode also
requires at least one progress interval and the expected number of samples, so a removed callback
cannot degrade into a post-commit false pass. The bare drain control and every positive run require
peak-minus-baseline below 16MiB. The negative control uses the same UploadServer/storage path with a
retaining transform and passes only when it retains exactly 50MiB and the forced-GC sampler detects
at least 16MiB growth. The gate
command is:

```bash
corepack pnpm check:upload-memory
```

### Live smoke

An isolated-HOME smoke runs serially in development and from a fresh production build. It checks:

1. setup/configured auth bootstrap and login
2. session, CLI token, unauthenticated and attacker-Origin authority matrix
3. raw socket Expect/CL+TE/short/extra-octet connection handling
4. Chromium File fetch for 10MiB image and 50MiB file success
5. 10MiB+1 and 50MiB+1 `413`
6. 11MiB and 37MiB generic file SHA-256 parity
7. active capacity 429, idle timeout and aborted upload leave no staged/final file
8. manual cleanup during active upload does not remove the staged file
9. non-upload protected API remains behind Next proxy
10. fresh production `pages-manifest.json` does not contain either removed upload route
11. no Next `Request body exceeded 10MB` warning for upload routes
12. kill switch and shutdown leave no owned staged file

The new command is:

```bash
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
corepack pnpm build
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
```

Existing Electron runtime smoke runs after the browser upload path to catch renderer/session
regression. Android is a legacy/reference surface and does not block this Windows-targeted slice.

Windows fresh runner verifies same-volume hard-link publication, observes a reserved staged file before abort and
then verifies native deletion, plus packaged launch and updater gate.
Linux evidence cannot replace that Windows-only gate.

After both checkpoints are implemented, run on a Windows fresh runner:

```bash
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
```

The packaged launch gate starts one instance with `CODEXMUX_UPLOADS_DISABLED=1` and verifies the
exact upload route returns 503 while health and authenticated non-upload API remain available.

## Plan Design Review

이 작업은 product UI를 변경하지 않으므로 visual review와 Lazyweb report 대상이 아닙니다.
대신 API state clarity, existing client feedback와 operator recovery를 검토했습니다.

| Dimension | Score | Decision |
| --- | ---: | --- |
| Information architecture | 9/10 | 두 exact route, typed status와 Next fallthrough가 분리됨 |
| Error-state clarity | 9/10 | HTTP status, stable code와 existing `error` field를 함께 유지 |
| Operator recovery | 9/10 | kill switch가 old vulnerable route로 fallback하지 않음 |
| Client compatibility | 8/10 | response shape와 browser File flow 유지, chunked custom client는 의도적으로 제외 |
| Visual/accessibility | N/A | layout, control, focus, copy와 locale file 변경 없음 |

Design blocker는 없습니다. Localized error mapping, batch retry/progress는 P0 integrity와 분리된
후속 product UI slice이며 수행 시 Lazyweb report와 ko/en locale 검토를 거칩니다.

## Documentation Impact

Update:

- `docs/ADR.md`: ADR-027 lifecycle
- `CONTEXT.md`: durable Upload ingress term and outer ownership boundary
- `docs/PROJECT-DESIGN.md`: outer upload ownership
- `docs/ARCHITECTURE-LOGIC.md`: dev/prod HTTP branch and transaction flow
- `docs/DATA-DIR.md`: committed upload and `.part` lifecycle
- `docs/TESTING.md`: dependency and upload gates
- `docs/WINDOWS-ONLY-GAP-AUDIT.md`: fresh Windows evidence requirement
- `docs/FOLLOW-UP.md`: resolved P0 and residual follow-up
- `docs/PURPLEMUX-ADOPTION-AUDIT.md`: correction of raw body overhead claim and implementation status
- `docs/README.md`: lifecycle and handoff map
- `docs/operations/2026-07-11-production-security-upload-integrity-handoff.md`

No `STATUS.md`, locale message, UI visual contract or Lazyweb report is required because status
types and product UI do not change.

## Rollback

### Dependency

Do not return to a vulnerable version. If a patched dependency breaks a gate, move to another
patched same-major version or hold release with the audit blocker recorded.

### Upload

There is no supported rollback to the known partial-success Pages API route. If a production
upload invariant, process crash or filesystem regression is observed, set
`CODEXMUX_UPLOADS_DISABLED=1`, restart the service and verify exact upload paths return 503 while
health, terminal and timeline remain available. Then ship a forward fix against the outer handler
before re-enabling uploads.

Dependency and upload changes remain separate verification checkpoints even when the user has not
requested commits. A dependency failure is recovered only by another patched version. An upload
failure is recovered with the kill switch and forward fix. Raising
`experimental.proxyClientMaxBodySize` or restoring the old Pages routes is not an accepted recovery
state.

## Acceptance Criteria

1. `corepack pnpm audit --prod` reports zero findings without ignore policy.
2. Exact intended package versions, two vulnerable-range overrides와 four next-intl family pins만
   추가되고 4.9.2 suite가 함께 resolve되며 Node engine은 `>=20.9.0`입니다.
3. Existing public/auth/proxy/data-route and WebSocket contracts pass after dependency upgrade.
4. Both upload paths are handled before Next in development and production.
5. Unauthorized request에는 application data listener/pipe와 staged file creation이 없고,
   session/CLI authority matrix가 spec과 일치합니다.
6. Exact limits succeed and limit+1 fails without committed artifact or staged file.
7. 11MiB and 37MiB generic artifacts match source byte length and SHA-256.
8. Missing/malformed/mismatched length, framing ambiguity, abort and storage error never return 200.
9. Expect handling never sends 100 before auth/admission; every upload response closes its connection.
10. Active count, byte budget, timeout and shutdown are bounded and leak-free with no pending queue.
11. Real-HTTP negative control detects retained chunks and three isolated 50MiB positive runs keep
    peak external-memory growth below 16MiB.
12. Staged/final files use 0o600 on POSIX and cleanup cannot delete an active staged file.
13. Existing client response shape, Chromium attachment behavior and upload layout remain compatible.
14. Listed Linux commands, fresh development/production smoke and Electron build/runtime smoke pass.
15. Kill switch disables upload only and is recorded in the operation handoff.
16. ADR-027 and canonical context/architecture/data/testing docs match implementation.
17. Windows packaged upload commit/hash, abort/delete, kill switch, packaged launch, updater and
    package gates must pass before ADR-027 can
    move from Implemented to Verified or lifecycle release can enter operate. If a Windows runner is
    unavailable, implementation may be reviewed but release/operate remains explicitly pending.

## Accepted Risks

- Same-authority upload Origin is stricter than the current generic proxy and may expose an
  undocumented custom browser client.
- Requiring Content-Length excludes chunked custom upload clients.
- Immediate 429 admission can make a very large client batch partially succeed; committed orphan
  files remain TTL cleanup candidates and existing clients already treat batch failure as an error.
- Upload-scoped auth duplicates a small part of proxy policy, so parity and refresh tests are release
  gates.
- Process kill can leave a staged file until the 30-minute age floor and the next startup,
  maintenance interval or manual stale cleanup.
- Windows atomic hard-link publication and file deletion semantics require fresh runner evidence.
- PostCSS override crosses Next's exact dependency declaration and requires production CSS build.

## Spec Freeze Snapshot

### Approved Domain Terms

- Durable: Upload ingress
- Spec-local: Upload transaction, upload artifact, upload policy, upload receipt, reservation lease,
  staged file
- Rejected: proxy upload, multipart upload, upload session, upload cache, temporary artifact

### Architecture Boundaries

- One lifecycle topic with dependency and upload verification checkpoints.
- Exact upload routes are owned before Next by one outer upload server instance.
- Raw request contract, upload auth, admission, HTTP orchestration and stateless storage are separate
  modules.
- No globalThis state for mutable upload ownership. Existing cleanup API may use stateless cleanup
  primitives but cannot delete active staged files.
- Pages upload routes are removed; direct Next/internal standalone is not an upload surface.

### Fixed Requirements

- Direct versions: Next 16.2.6, eslint-config-next 16.2.6, next-intl suite 4.9.2, ws 8.21.0,
  js-yaml 4.2.0.
- Runtime manifest: Node >=20.9.0.
- Overrides: PostCSS 8.5.10, Babel 7.29.6 and four next-intl family coherence pins.
- Image/file limits: 10MiB/50MiB; raw canonical Content-Length required; no Transfer-Encoding or
  non-identity Content-Encoding.
- Auth order: strict Host, CLI then session, credential-specific Origin, rolling session refresh.
- Admission: 8 active, 200MiB declared-byte budget, no queue, 60-second idle and 270-second absolute
  timeout.
- Transport: authenticated `100 Continue` only, every upload connection closes, socket quarantine
  blocks follow-up request dispatch.
- Composition order: pure raw classifier/quarantine, outer source/bootstrap guard, upload
  auth/Origin/policy/admission, body/storage.
- Storage: `wx`/0o600 staged file, same-directory close then no-replace hard-link commit, 128-bit generated name,
  bounded Windows retry, 30-minute staged cleanup floor.
- Recovery: `CODEXMUX_UPLOADS_DISABLED=1` returns 503 without Next fallback.

### Non-Goals

- Product UI/locales, progress/retry, multipart/resumable/object storage, content scanning, new
  forwarded-header trust, other API body refactor and Windows ACL redesign.

### Review Decisions

- Domain architecture: passed after auth result, cleanup ownership and terminology fixes.
- Grill-me: passed with no open user decision.
- Plan design review: passed as non-visual state/operator review.
- ADR-027: Implemented; three independent engineering reviews passed and Linux gates are green.

### Environment And Release

- Implementation baseline: Node >=20.9, pnpm, Linux development/production custom server and
  Electron build/runtime smoke.
- Windows-only hard-link/delete, packaged kill-switch propagation, updater/package/release gates remain
  mandatory before ADR Verified and operate entry.
- No commit, push, issue or deployment without a separate explicit user request.

### Accepted Residual Risks

- Same-authority and Content-Length requirements intentionally break undocumented custom browser or
  chunked clients.
- Immediate 429 can partially complete an oversized concurrent batch; orphan artifacts remain TTL
  cleanup candidates.
- Recent process-kill staged files remain until the 30-minute cleanup floor.
- PostCSS/Babel overrides require production build evidence.
