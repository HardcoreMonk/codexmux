# Production Security And Upload Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Project policy overrides generic skill templates: do not commit or
> push unless the user explicitly asks.

**Goal:** Remove the audited production dependency advisories and replace the
truncation-prone Next upload routes with authenticated, bounded, atomic streaming
upload ingress owned by the outer custom server.

**Architecture:** Complete the dependency checkpoint before upload source changes.
For uploads, keep pure raw request parsing, credential authorization, bounded
admission, filesystem streaming, and HTTP orchestration in focused modules, then
compose one process-scoped upload server before the Next development handler or
production proxy. Every accepted transaction owns one reservation lease and one
same-directory staged file until atomic no-replace hard-link publish or abort.

**Tech Stack:** TypeScript 5.9, Node HTTP and filesystem streams, Next.js 16 Pages
Router with the existing custom server, jose, Vitest 4, pnpm 10.

---

## Inputs And Fixed Decisions

- Design spec:
  `docs/superpowers/specs/2026-07-11-production-security-upload-integrity-design.md`
- Grill-me:
  `docs/superpowers/grill-me/2026-07-11-production-security-upload-integrity.md`
- Purplemux audit: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- ADR-027 is `Implemented` after implementation and Linux gates passed; fresh Windows
  evidence is still required for `Verified`.
- The written spec was approved by the user on 2026-07-11.
- No product UI, locale, status model, multipart, resumable upload, object storage,
  scanning, or forwarded-header trust change is included.
- Existing dirty work from the approved pre-auth bootstrap security slice is part
  of the implementation baseline and must not be reverted.
- No issue, commit, push, deployment, or release-state claim is made without a
  separate explicit user request.

## Execution Constraints

- Update the manifest Node engine floor to `>=20.9.0`, matching both current and
  patched Next runtime support; use no Node 24-only API. Verification runs on the
  repository's Node 24 toolchain.
- The planning/implementation host is Linux. Fresh Windows hard-link/delete,
  packaged launch, updater, package, and release gates remain mandatory before
  ADR-027 can be `Verified` or lifecycle release can enter operate.
- Upload ingress exists only through `server.ts`. Removed Pages routes and the
  internal standalone port are not fallback upload surfaces.
- Raw `Content-Length` bodies remain the client contract. Chunked transfer,
  non-identity content encoding, and multipart bodies are rejected.
- All upload responses, including successful responses and pre-body rejections,
  send `Connection: close`.
- Test fixtures generate repeated chunks and temporary files. They must not keep
  multiple 10MiB or 50MiB buffers in one test process.
- Use temporary `HOME` plus `vi.resetModules()` for filesystem module tests because
  `UPLOADS_DIR` is derived at import time.

## Next.js Contract Read

Before changing integration code, re-read the local Next 16.2.6 documentation after
the dependency checkpoint:

- `node_modules/next/dist/docs/02-pages/02-guides/custom-server.md`
- `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/07-api-routes.md`
- `node_modules/next/dist/docs/02-pages/04-api-reference/02-file-conventions/proxy.md`

Record only implementation-relevant changes in this plan or the design spec. Do
not restore the Pages upload routes to accommodate framework behavior.

## File Map

Create:

- `src/lib/upload-request-contract.ts`
- `src/lib/upload-request-auth.ts`
- `src/lib/upload-admission.ts`
- `src/lib/upload-server.ts`
- `src/lib/server-http-dispatcher.ts`
- `tests/unit/lib/upload-request-contract.test.ts`
- `tests/unit/lib/upload-request-auth.test.ts`
- `tests/unit/lib/upload-admission.test.ts`
- `tests/unit/lib/uploads-store.test.ts`
- `tests/unit/lib/upload-server.test.ts`
- `tests/unit/lib/server-http-dispatcher.test.ts`
- `tests/unit/lib/upload-image-client.test.ts`
- `tests/unit/lib/upload-file-client.test.ts`
- `tests/unit/pages/uploads-cleanup.test.ts`
- `tests/integration/upload-http-ingress.test.ts`
- `tests/unit/scripts/upload-integrity-smoke-lib.test.ts`
- `scripts/check-upload-stream-memory.ts`
- `scripts/smoke-upload-integrity-lib.mjs`
- `scripts/smoke-upload-integrity.mjs`
- `docs/operations/2026-07-11-production-security-upload-integrity-handoff.md`

Modify:

- `package.json`
- `pnpm-lock.yaml`
- `src/lib/request-authority.ts`
- `src/lib/uploads-store.ts`
- `src/pages/api/uploads/cleanup.ts`
- `server.ts`
- `tests/unit/lib/request-authority.test.ts`
- `tests/unit/proxy-config.test.ts`
- `tests/unit/scripts/windows-packaged-launch-smoke-lib.test.ts`
- `tests/unit/scripts/windows-package-gate-lib.test.ts`
- `scripts/smoke-pre-auth-bootstrap-security.mjs`
- `scripts/smoke-windows-packaged-launch.mjs`
- `scripts/windows-packaged-launch-smoke-lib.mjs`
- `scripts/windows-package-gate-lib.mjs`
- `docs/ADR.md`
- `CONTEXT.md`
- `docs/README.md`
- `docs/PROJECT-DESIGN.md`
- `docs/ARCHITECTURE-LOGIC.md`
- `docs/DATA-DIR.md`
- `docs/TESTING.md`
- `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- `docs/FOLLOW-UP.md`
- `docs/PURPLEMUX-ADOPTION-AUDIT.md`

Delete:

- `src/pages/api/upload-image.ts`
- `src/pages/api/upload-file.ts`

## Task 1: Production Dependency Security Checkpoint

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Capture the RED advisory and graph baseline**

Run and save the high-signal counts in the task log:

```bash
corepack pnpm audit --prod --json
corepack pnpm why --prod next next-intl use-intl icu-minify next-intl-swc-plugin-extractor postcss ws js-yaml @babel/core
```

Expected baseline: 20 production findings, High 8 / Moderate 8 / Low 4,
including Next 16.2.4, ws 8.20.0, next-intl 4.9.1, PostCSS 8.4.31,
js-yaml 4.1.1, and Babel 7.29.0.

- [x] **Step 2: Apply only the frozen direct pins and overrides**

Set exact direct versions:

```json
{
  "next": "16.2.6",
  "next-intl": "4.9.2",
  "ws": "8.21.0",
  "eslint-config-next": "16.2.6",
  "js-yaml": "4.2.0"
}
```

Set `engines.node` to `>=20.9.0`; this corrects the repository's pre-existing
understatement of the runtime required by both Next 16.2.4 and 16.2.6.

Append these keys to the existing `pnpm.overrides` object without changing the
existing Hono, lodash, xmldom, or picomatch policy:

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

Regenerate the lockfile with:

```bash
corepack pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile
corepack pnpm install --frozen-lockfile
```

- [x] **Step 3: Verify the dependency checkpoint GREEN**

Run:

```bash
corepack pnpm audit --prod
corepack pnpm why --prod next @next/env @next/swc-linux-x64-gnu @next/swc-linux-x64-musl next-intl use-intl icu-minify next-intl-swc-plugin-extractor postcss ws js-yaml @babel/core
corepack pnpm why eslint-config-next @next/eslint-plugin-next
rg -n "(next|@next/env|@next/swc-[^:]+)@16\\.2\\.6" pnpm-lock.yaml
if rg -n "(next|@next/env|@next/swc-[^:]+)@16\\.2\\.4" pnpm-lock.yaml; then exit 1; fi
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

Expected: audit reports zero findings; the next-intl suite resolves uniformly to
4.9.2; Next/SWC/env and eslint-config/plugin resolve to 16.2.6; PostCSS resolves to
8.5.10; Babel resolves to 7.29.6; ws resolves to 8.21.0; electron-updater's
js-yaml resolves to 4.2.0; no prior vulnerable resolution remains; all listed
gates pass.
An advisory newly published during execution is a blocker, not an ignore candidate.

## Task 2: Raw Upload Request Contract

**Files:**

- Create: `src/lib/upload-request-contract.ts`
- Create: `tests/unit/lib/upload-request-contract.test.ts`

- [x] **Step 1: Add RED raw-target classification tests**

Test the public result contract:

```typescript
expect(classifyUploadRequestTarget('/api/upload-image')).toMatchObject({
  matched: true,
  valid: true,
  policy: { kind: 'image', maxBytes: 10 * 1024 * 1024 },
});
expect(classifyUploadRequestTarget('/api/upload-file?source=drop')).toMatchObject({
  matched: true,
  valid: true,
  policy: { kind: 'file', maxBytes: 50 * 1024 * 1024 },
});
```

Cover exact origin-form targets, query suffixes, ordinary fallthrough, trailing
slash, locale prefix, prefix/suffix, absolute-form, authority-form, fragment,
control characters, backslash, percent-encoded delimiter/dot segment, literal dot
segment, and every target that becomes exact only after WHATWG normalization.

- [x] **Step 2: Run the classifier test and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-request-contract.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement immutable route policies and pure classification**

Export the frozen types and policies:

```typescript
export type TUploadKind = 'image' | 'file';
export type TUploadPolicy = {
  kind: TUploadKind;
  pathname: '/api/upload-image' | '/api/upload-file';
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string> | null;
};
export type TUploadRouteMatch =
  | { matched: false }
  | { matched: true; valid: false; statusCode: 400; reason: 'invalid-upload-target' }
  | { matched: true; valid: true; policy: TUploadPolicy };
```

Classification must inspect the raw request target before decoding or URL
normalization. It may strip only the first literal `?` and following query.

- [x] **Step 4: Add RED header and metadata matrix tests**

Define `parseUploadRequestContract(request, policy)` and cover:

- one canonical positive decimal Content-Length;
- missing 411, duplicate/sign/leading-zero/non-decimal/unsafe/zero 400;
- route maximum + 1 as 413;
- any Transfer-Encoding or duplicate/non-identity Content-Encoding as 400;
- single identity Content-Encoding as valid;
- image MIME allowlist and optional parameters;
- missing/duplicate/unsupported image Content-Type as 400;
- generic file with absent Content-Type and single normalized MIME;
- duplicate filename, workspace id, and tab id as 400;
- malformed percent-encoded filename as 400;
- omitted metadata fallback and sanitized decoded metadata preservation.

Use this result shape:

```typescript
export type TParsedUploadRequest = {
  declaredBytes: number;
  mime: string | null;
  originalName?: string;
  workspaceId?: string;
  tabId?: string;
};
```

- [x] **Step 5: Run the expanded contract test and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-request-contract.test.ts
```

Expected: route tests pass but header parsing cases fail because
`parseUploadRequestContract` is absent.

- [x] **Step 6: Implement canonical raw-header parsing and run GREEN**

Read multiplicity from `rawHeaders`, not comma-joined `headers`. Treat Node's
parser-normalized Content-Length as the framing authority and do not invent a
wire-level OWS distinction unavailable to `IncomingMessage`.

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-request-contract.test.ts
```

Expected: all route, framing, MIME, and metadata tables pass.

## Task 3: Upload Credential And Authority Adapter

**Files:**

- Modify: `src/lib/request-authority.ts`
- Modify: `tests/unit/lib/request-authority.test.ts`
- Create: `src/lib/upload-request-auth.ts`
- Create: `tests/unit/lib/upload-request-auth.test.ts`

- [x] **Step 1: Add RED protocol-preservation tests**

Extend the valid authority expectation:

```typescript
expect(validateBrowserRequestAuthority(
  request(['Host', 'example.test:443', 'Origin', 'https://example.test']),
  { requireLoopbackHost: false },
)).toMatchObject({
  valid: true,
  authority: 'example.test:443',
  protocol: 'https:',
});
```

Also assert `http:` is returned for HTTP origins and Host-only validation continues
to work without a fabricated protocol.

- [x] **Step 2: Run authority tests and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/request-authority.test.ts
```

Expected: protocol assertions fail while existing authority cases remain green.

- [x] **Step 3: Implement protocol on the valid browser authority result**

Split the success types so Host-only validation does not fabricate a scheme while
browser authority makes protocol mandatory:

```typescript
export type TRequestHostResult =
  | { valid: true; authority: string; loopbackHost: boolean }
  | TRequestAuthorityRejection;

export type TBrowserRequestAuthorityResult =
  | {
      valid: true;
      authority: string;
      loopbackHost: boolean;
      protocol: 'http:' | 'https:';
    }
  | TRequestAuthorityRejection;
```

No forwarded header participates in either value. Existing bootstrap/install
callers continue to narrow on `valid` without behavior changes.

- [x] **Step 4: Add RED upload authorization tests**

Inject CLI and session verifiers and cover:

```typescript
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
```

Test missing credentials, invalid credentials, valid CLI, valid session, invalid
CLI plus valid session fallback, dual-valid CLI precedence, duplicate Cookie and
CLI token headers, session expiry, rolling refresh below `MAX_AGE / 2`, and
dependency/config failure as sanitized 503.

Also reject multiple `session-token` pairs inside one syntactically valid Cookie
header as 400 instead of accepting the first value.

Reject structural duplicate Cookie or CLI token headers as
`invalid-upload-request` 400 before checking either credential, even when the other
credential would otherwise be valid.

- [x] **Step 5: Run upload authorization tests and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-request-auth.test.ts
```

Expected: FAIL because the upload authorization module does not exist.

- [x] **Step 6: Implement `authorizeUploadRequest()` and authority policy helpers**

Use `verifyTokenValue()`, `extractCookie()`, `verifySessionToken()`, `SESSION_COOKIE`,
and `MAX_AGE`. The adapter never signs a refresh token and never logs raw headers.
Its default dependency performs an explicit non-empty `NEXTAUTH_SECRET`
precondition before session verification: missing runtime auth state maps to 503,
while a malformed/expired JWT with an available secret maps to 401. Add a
non-mocked default-dependency test for both cases; injected verifier throws also
map to 503.
Expose a pure helper that applies credential-specific Origin policy:

```typescript
export type TUploadOriginResult =
  | { valid: true; secure: boolean }
  | { valid: false; statusCode: 403; reason: 'origin-forbidden' };
```

CLI may omit Origin; when it is present it must pass same-authority validation.
Session always requires same-authority Origin. Strict single Host validation runs
before credential verification in the UploadServer task.

- [x] **Step 7: Run auth and authority tests GREEN**

```bash
corepack pnpm exec vitest run tests/unit/lib/request-authority.test.ts tests/unit/lib/upload-request-auth.test.ts
```

Expected: credential precedence, expiry, refresh intent, Origin matrix, and secure
protocol derivation all pass.

## Task 4: Bounded Upload Admission

**Files:**

- Create: `src/lib/upload-admission.ts`
- Create: `tests/unit/lib/upload-admission.test.ts`

- [x] **Step 1: Add RED reservation lifecycle tests**

Test the frozen API:

```typescript
interface IUploadReservationLease {
  ownerId: symbol;
  signal: AbortSignal;
  release: () => void;
}

interface IUploadAdmissionService {
  reserve: (declaredBytes: number) => TUploadAdmissionResult;
  shutdown: () => void;
}
```

Cover eight active leases, the 200MiB declared-byte budget, immediate ninth/count
rejection, byte-budget rejection, release and re-admission, repeated release,
shutdown rejection, active lease abort on shutdown, and exact-once counter/budget
release under competing release/shutdown calls.

- [x] **Step 2: Confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-admission.test.ts
```

Expected: FAIL because the admission module does not exist.

- [x] **Step 3: Implement `createUploadAdmissionService()`**

Default limits are:

```typescript
const DEFAULT_MAX_ACTIVE_UPLOADS = 8;
const DEFAULT_MAX_RESERVED_UPLOAD_BYTES = 200 * 1024 * 1024;
```

Use an owner-keyed internal Map, one `AbortController` per lease, no pending queue,
and an idempotent closure for release. Export a read-only snapshot only for tests
and diagnostics; it must not expose owner ids or signals.

- [x] **Step 4: Run admission tests GREEN**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-admission.test.ts
```

Expected: all capacity and exact-once lifecycle tests pass.

## Task 5: Streaming Storage And Cleanup Ownership

**Files:**

- Modify: `src/lib/uploads-store.ts`
- Modify: `src/pages/api/uploads/cleanup.ts`
- Create: `tests/unit/lib/uploads-store.test.ts`
- Create: `tests/unit/pages/uploads-cleanup.test.ts`

- [x] **Step 1: Add RED filesystem transaction tests**

With an isolated `HOME`, generated Readable streams, and injected filesystem
failure points, cover:

- exact 10MiB image and exact 50MiB file commit;
- 37MiB size and SHA-256 parity;
- observed limit overflow, short body, `complete=false`, abort, write failure,
  close failure, and publication failure never create a final artifact;
- same-directory reserved `.<32-hex>.upload.part` creation with `wx` and 0o600;
- final filename contains 128 random bits, retains sanitized basename/extension,
  and collision regenerates instead of overwriting;
- successful hard-link creation is the commit point: response-layer failure cannot delete it;
- EPERM/EBUSY close, link, and unlink retries use 25/50/100/200ms;
- exhausted pre-commit cleanup returns `cleanup: 'failed'` and leaves only `.part`;
- committed cleanup ignores only the reserved staged namespace, while a legitimate
  final artifact whose original extension is `.part` remains eligible for cleanup;
- staged cleanup clamps age to at least 30 minutes;
- zero-byte stale staged removal increments `deleted` while adding zero freed bytes;
- cleanupAllUploads is idempotent and never removes an active/recent staged file.

Use the public stream contract from the spec:

```typescript
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
```

- [x] **Step 2: Run storage tests and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/uploads-store.test.ts
```

Expected: FAIL because `streamUploadArtifact` and staged cleanup do not exist and
the current save functions require full Buffers.

- [x] **Step 3: Implement staged streaming and atomic commit**

Add the streaming entry point and keep the current `saveImage`/`saveFile` exports as
temporary compatibility wrappers until Task 7 deletes their only callers:

```typescript
export const streamUploadArtifact = async (
  input: IStreamUploadArtifactInput,
): Promise<TUploadTransactionResult> => {};

export const cleanupStaleUploadParts = async (
  minimumAgeMs?: number,
): Promise<ICleanupResult> => {};
```

Use `stream/promises.pipeline`, a byte-counting Transform, an AbortSignal, an
exclusive same-directory staged file, awaited writer close, and `fs.link` no-replace publish. Never use
`Buffer.concat` or a body-sized chunk array. Map expected stream/storage failures
to discriminated results and throw only programming errors. The byte-counting
Transform invokes `onProgress()` after each accepted chunk so UploadServer can
reset its idle clock without subscribing to the source early.

- [x] **Step 4: Add cleanup API tests and confirm RED**

Add method, default/all mode, aggregated counters, and failure tests to
`tests/unit/pages/uploads-cleanup.test.ts`, then run:

```bash
corepack pnpm exec vitest run tests/unit/pages/uploads-cleanup.test.ts
```

Expected: aggregate cases fail because the route does not call staged cleanup.

- [x] **Step 5: Refactor committed cleanup without broad behavior changes**

`cleanupExpiredUploads()` and `cleanupAllUploads()` visit only committed names.
`cleanupStaleUploadParts()` visits only a strict reserved staged filename such as
`.<32-hex>.upload.part` older than the 30-minute floor; never classify by a simple
`.part` suffix. File removal returns separate `removed` and `bytes` fields so a
zero-byte unlink is counted. Directory cleanup runs only after file iteration and
tolerates concurrent disappearance.

Update the authenticated cleanup API so both modes invoke stale-part cleanup and
sum `{ deleted, freedBytes }` into the existing response shape. Test method
handling, combined counts, and unchanged response fields. If either cleanup call
throws, return the existing 500 `{ error: 'Cleanup failed' }`; completed deletions
are not rolled back and partial success is never reported as 200.

- [x] **Step 6: Run storage and cleanup tests GREEN**

```bash
corepack pnpm exec vitest run tests/unit/lib/uploads-store.test.ts tests/unit/pages/uploads-cleanup.test.ts
```

Expected: transaction, retry, mode, collision, parity, and cleanup tests pass with
no final artifact on pre-commit failure.

## Task 6: Upload HTTP Orchestrator

**Files:**

- Create: `src/lib/upload-server.ts`
- Create: `tests/unit/lib/upload-server.test.ts`

- [x] **Step 1: Add RED pre-body gate-order tests**

Build fake `IncomingMessage`/`ServerResponse`, authorizer, admission, clock, and
storage adapters. Assert the order:

```text
strict Host -> credential -> Origin -> method -> framing/policy -> refresh signing
-> admission -> optional 100 -> body/storage
```

For every failure before admission, assert no `data` listener/pipe, no reservation,
no staged storage call, final JSON response, and `Connection: close`.

Cover stable code/status/error mappings, `Allow: POST`, `Retry-After: 1`, disabled
503, shutting-down 503, and sanitized unexpected storage failure.

Map internal `upload-aborted` and `length-mismatch` to external
`invalid-upload-request` 400, internal `payload-too-large` to 413, timeout to 408,
and storage failure to 500. A failed pre-commit staged unlink is itself
`storage-failure` 500, overriding an earlier 400/408 because cleanup integrity is
no longer known. Diagnostics never expose a path.

- [x] **Step 2: Add RED Expect, timeout, and terminal-state tests**

Cover:

- `100 Continue` only after auth/policy/admission;
- exact upload with unsupported Expect as 417 without body consumption;
- raw upgrade attempt returns 503 while disabled/shutting down and otherwise 400,
  always closing without credential/body/storage work;
- rolling session refresh signed after Origin but before admission;
- refresh signing failure as auth-unavailable 503;
- 60-second idle timer reset by each body chunk;
- 270-second absolute timer from admission;
- Node requestTimeout preemption after slow headers still triggers abort cleanup
  and exact-once release without claiming an application-generated 408;
- timeout as 408 with lease release and staged cleanup;
- request aborted/error/incomplete, response close, shutdown, storage completion,
  and timeout racing through one terminal transition;
- committed result survives response disconnect;
- startup stale cleanup runs once; recursive 30-minute maintenance is unrefed,
  non-overlapping, error-isolated, and rescheduled;
- shutdown clears maintenance, awaits an in-flight cleanup, and releases every
  lease exactly once.

- [x] **Step 3: Confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-server.test.ts
```

Expected: FAIL because `createUploadServer` does not exist.

- [x] **Step 4: Implement `createUploadServer()`**

Implement the frozen interface:

```typescript
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
```

Inject `cleanupStaleParts: () => Promise<ICleanupResult>` in
`IUploadServerOptions`. `start()` runs it once with sanitized failure isolation and
registers the recursive 30-minute timeout. A maintenance promise prevents overlap;
the timer calls `unref()` and shutdown awaits any in-flight run.

The server owns active transaction promises, idle/absolute clocks, maintenance
timer, and shutdown state. `beginShutdown()` synchronously rejects new work;
`shutdown()` aborts active leases, clears maintenance, and awaits cleanup. It
delegates mutable capacity to its single admission instance and storage to
`streamUploadArtifact`. It logs only low-cardinality codes.

Reset idle time from the bounded monitoring Transform in the storage pipeline, not
from an early standalone `request.on('data')` listener that would start flow before
the writer is attached.

- [x] **Step 5: Implement response-close and refresh semantics**

Use a single JSON response writer that checks `headersSent`, `writableEnded`, and
socket state. Pre-body rejection ends the response, waits for `finish`, then closes
the socket. Successful response includes `{ path, filename }`; failures include
`{ code, error }`. Session refresh uses the validated Origin protocol for the
Secure cookie flag.

- [x] **Step 6: Run orchestrator tests GREEN**

```bash
corepack pnpm exec vitest run tests/unit/lib/upload-server.test.ts
```

Expected: all ordering, Expect, timeout, cleanup, shutdown, response, and error-map
tests pass with no unhandled rejection.

## Task 7: Outer Server Composition And Pages Route Removal

**Files:**

- Create: `src/lib/server-http-dispatcher.ts`
- Create: `tests/unit/lib/server-http-dispatcher.test.ts`
- Modify: `server.ts`
- Modify: `src/lib/runtime/server-ws-upgrade.ts`
- Modify: `tests/unit/lib/runtime/server-ws-upgrade.test.ts`
- Modify: `src/lib/uploads-store.ts`
- Modify: `tests/unit/lib/uploads-store.test.ts`
- Delete: `src/pages/api/upload-image.ts`
- Delete: `src/pages/api/upload-file.ts`
- Create: `tests/integration/upload-http-ingress.test.ts`
- Create: `tests/unit/lib/upload-image-client.test.ts`
- Create: `tests/unit/lib/upload-file-client.test.ts`
- Modify: `tests/unit/proxy-config.test.ts`

- [x] **Step 1: Add RED real HTTP composition tests**

Start a minimal outer HTTP server using the same composition function and real raw
sockets. Cover:

- exact upload request is handled before the dev/production fallback;
- ordinary request reaches fallback after the outer bootstrap/source guard;
- source/bootstrap rejection closes normal and Expect upload after final response;
- non-upload `Expect: 100-continue` gets exactly one 100, has Expect removed, and
  reaches fallback;
- exact upload with unsupported Expect returns 417;
- non-upload `checkExpectation` preserves Node's 417 and never reaches fallback;
- duplicate CL and CL+TE rejected by Node parser do not reach fallback;
- exact upload success and rejection close the connection;
- extra octets parsed as a pipelined second request are paused and never reach
  Next/fallback, while the first upload response still flushes completely;
- authenticated `Connection: Upgrade` on exact/normalization-only upload targets
  is rejected after the outer guard and never reaches WebSocket/Next fallback;
- injected async upload request/upgrade rejection is caught at the event entry,
  closes fail-safe, and produces no `unhandledRejection`;
- rejected async Next upgrade fallback is awaited and contained;
- `CONNECT` remains fail-closed and never dispatches to upload/Next;
- slow-header Node timeout produces no staged file or leaked lease;
- disabled exact route returns 503 and never falls through.
- active WebSocket shutdown completes within a bounded deadline instead of waiting
  on `server.close()` before upgraded sockets are terminated.

- [x] **Step 2: Confirm integration RED**

```bash
corepack pnpm exec vitest run tests/unit/lib/server-http-dispatcher.test.ts tests/integration/upload-http-ingress.test.ts
```

Expected: FAIL because outer upload composition and event listeners are absent.

- [x] **Step 3: Compose one upload server in development and production**

Implement and export this injectable factory from
`src/lib/server-http-dispatcher.ts`:

```typescript
export const createServerHttpDispatcher = (options: {
  validateRequest: (request: IncomingMessage) => TUpgradeRequestGuardResult;
  uploadServer: IUploadServer;
  fallbackRequest: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>;
  fallbackUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void | Promise<void>;
}): IServerHttpDispatcher => {};
```

It exposes handlers attached to `request`, `checkContinue`, `checkExpectation`,
and an upload-target preflight used before the existing `upgrade` handler. Refactor
both start paths to create `http.createServer()` without a request callback and
attach the same dispatcher. Await `uploadServer.start()` before listening; cleanup
failure is already isolated by UploadServer and cannot skip timer registration.
The dispatcher performs:

```text
raw classify/quarantine -> validateServerRequest -> upload or fallback
```

Use a socket-keyed `WeakMap` owner. The first matching upload request claims the
socket; any later request on that socket is paused and left undispatched until the
owner's final response closes it. Each EventEmitter entrypoint immediately catches
promises from request, Expect, upload upgrade, and fallback handlers; an async
listener return value is never relied on. Exact/invalid upload upgrade attempts run the outer guard and
receive 503 when uploads are disabled/shutting down, otherwise 400, without
entering the existing WebSocket fallback.

The existing WebSocket router must widen its fallback callback to
`void | Promise<void>` and await it. Next 16.2.6's development upgrade handler is
Promise-based, so merely wrapping the router at the outer dispatcher does not
contain a floating fallback rejection.

- [x] **Step 4: Preserve non-upload and shutdown behavior**

For non-upload `checkContinue`, write one interim response, delete the forwarded
Expect header from both normalized and raw headers, and call the existing Next
handler or production proxy. Non-upload `checkExpectation` returns 417. During
shutdown, call `beginShutdown()`, start a callback-backed `server.close()` promise,
and await `uploadServer.shutdown()` to abort/clean active work. Then run the
existing runtime/WebSocket shutdown, wait the bounded grace period, terminate
remaining WebSocket clients and every dispatcher-tracked upgraded socket, then call
`server.closeAllConnections()` to close stalled/half-open ordinary HTTP connections.
Only after those stages complete should shutdown await the close promise. Node waits
for active upgraded sockets in the close callback, while `closeAllConnections()` does
not close upgraded sockets, so awaiting close early or omitting explicit upgraded
socket termination deadlocks. Add real stalled-upload and active-WebSocket shutdown
tests with overall deadlines.

- [x] **Step 5: Remove the Pages upload routes and verify no fallback surface**

Delete both files and remove the temporary `saveImage`/`saveFile` compatibility
exports after `rg` confirms no callers. Build and parse
`.next/server/pages-manifest.json`; fail if either upload path remains. This stable
manifest evidence replaces heuristic discovery of the unexposed random internal
port.

Add client contract tests without changing production client code. Assert raw File
body, Content-Type, percent-encoded filename, optional workspace/tab headers,
10MiB/50MiB client limits, `{ path, filename }` parsing, and additive server `code`
tolerance while the existing `error` field remains user-visible.

Extend proxy matcher characterization so the removed upload paths and retained
cleanup API remain protected surface names even though exact uploads are consumed
by the outer server first.

- [x] **Step 6: Run composition and focused regressions GREEN**

```bash
corepack pnpm exec vitest run tests/unit/lib/server-http-dispatcher.test.ts tests/integration/upload-http-ingress.test.ts tests/unit/lib/upload-server.test.ts tests/unit/lib/upload-image-client.test.ts tests/unit/lib/upload-file-client.test.ts tests/unit/proxy-config.test.ts tests/unit/lib/bootstrap-request-guard.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
node -e "const m=require('./.next/server/pages-manifest.json'); for (const p of ['/api/upload-image','/api/upload-file']) if (p in m) process.exit(1)"
```

Expected: upload ownership is outer-only in dev and production; ordinary HTTP and
WebSocket behavior remains green.

## Task 8: Memory Oracle And Live Upload Smoke

**Files:**

- Create: `scripts/check-upload-stream-memory.ts`
- Create: `scripts/smoke-upload-integrity-lib.mjs`
- Create: `scripts/smoke-upload-integrity.mjs`
- Create: `tests/unit/scripts/upload-integrity-smoke-lib.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add RED smoke helper tests**

Test child-process lifecycle, isolated HOME creation, port/build-id discovery,
cookie and CLI request construction, raw socket response parsing, SHA-256 helper,
artifact scan, staged-file scan, and cleanup-on-failure behavior. Include a fixture
with an interim 100 followed by a final response and a fixture with a closed
connection after one response.

- [x] **Step 2: Run smoke helper tests and confirm RED**

```bash
corepack pnpm exec vitest run tests/unit/scripts/upload-integrity-smoke-lib.test.ts
```

Expected: FAIL because the smoke helper module does not exist.

- [x] **Step 3: Implement the isolated external-memory gate**

`scripts/check-upload-stream-memory.ts` must:

1. require `global.gc` in the measured server process;
2. create a temporary root, set both `HOME` and `USERPROFILE`, and only then
   dynamically import UploadServer/uploads-store so `UPLOADS_DIR` cannot bind to
   the developer's real home;
3. start a real local HTTP server using the production UploadServer/storage path;
4. spawn the same script in `--client` mode so client allocations are isolated;
5. have the client reuse one 64KiB Buffer for 800 backpressure-driven writes;
6. run GC three times before admission and before every measurement;
7. sample live external memory after every 16 server-side progress callbacks and
   after commit, always after those three GC cycles;
8. verify 50MiB artifact size and SHA-256;
9. fail when peak minus baseline is 16MiB or more;
10. close server/child handles and remove the temporary tree in `finally` for
    success, expected negative-control detection, and failure.

Because the HTTP parser creates distinct server-side body chunks, retaining a
chunk array now grows measured memory. A `--harness-control` mode drains the same
real HTTP body without the production adapter and must remain below 16MiB. A
`--negative-control` mode uses the same UploadServer/storage path, intentionally retains exactly
50MiB, and exits successfully only when the forced-GC sampler detects at least 16MiB growth.
Production runs also assert progress callback and sample counts.

The package script runs one known-good harness control, one negative control, and
three isolated positive processes with Node 20-compatible direct flags:

```json
{
  "check:upload-memory": "node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts --harness-control && node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts --negative-control && node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts && node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts && node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts"
}
```

tsx 4.21 re-executes Node and only forwards this runtime flag when it appears after
the tsx CLI entrypoint. Placing `--expose-gc` before that entrypoint was verified
to leave `global.gc` undefined.

The chained command starts a fresh process for each of the three runs:

```bash
node node_modules/tsx/dist/cli.mjs --expose-gc scripts/check-upload-stream-memory.ts
```

- [x] **Step 4: Implement the development/production live smoke**

The serial smoke must cover the 12 design-spec cases: setup/login, session/CLI
authority matrix, raw Expect/framing/extra-octet handling, Chromium exact limits,
limit+1, 11MiB/37MiB parity, capacity/timeout/abort cleanup, manual cleanup during
active upload, non-upload protected API, internal standalone absence, warning scan,
kill switch, and shutdown cleanup.

Use `CODEXMUX_UPLOAD_SMOKE_MODE=development|production`. Do not reuse a developer's
real config, token, port, upload directory, or browser profile.

- [x] **Step 5: Add scripts and run gates GREEN**

Add:

```json
{
  "smoke:upload-integrity": "node scripts/smoke-upload-integrity.mjs"
}
```

Run:

```bash
corepack pnpm exec vitest run tests/unit/scripts/upload-integrity-smoke-lib.test.ts
corepack pnpm check:upload-memory
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
corepack pnpm build
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
```

Expected: three memory runs stay below 16MiB external growth; both runtime modes
preserve bytes/hashes and reject all unsafe cases without staged/final leakage.

## Task 9: Full Regression And Windows Evidence Boundary

**Files:**

- Modify: `scripts/smoke-pre-auth-bootstrap-security.mjs`
- Modify: `scripts/smoke-windows-packaged-launch.mjs`
- Modify: `scripts/windows-packaged-launch-smoke-lib.mjs`
- Modify: `scripts/windows-package-gate-lib.mjs`
- Modify: `tests/unit/scripts/windows-packaged-launch-smoke-lib.test.ts`
- Modify: `tests/unit/scripts/windows-package-gate-lib.test.ts`

- [x] **Step 1: Extend production auth regression assertions**

After a fresh build, assert unauthenticated `/_next/data/<buildId>/index.json` returns
only a login redirect contract without protected props, conflicting external
`nxtPpaneId`/`nxtPtabId` values remain 401, and an
authenticated unknown WebSocket cannot select an attacker destination. Keep these
assertions in the existing pre-auth smoke rather than duplicating its bootstrap.

- [x] **Step 2: Add RED Windows upload gate tests**

Extend the packaged-launch helper and package-gate tests first. Assert that
`--upload-integrity` selects a dedicated artifact/mode, the package gate requires
`smoke:windows:upload-integrity`, and failure stops subsequent steps.

```bash
corepack pnpm exec vitest run tests/unit/scripts/windows-packaged-launch-smoke-lib.test.ts tests/unit/scripts/windows-package-gate-lib.test.ts
```

Expected: new mode/step assertions fail before script and gate wiring exist.

- [x] **Step 3: Implement packaged Windows upload and kill-switch evidence**

Add package script:

```json
{
  "smoke:windows:upload-integrity": "node scripts/smoke-windows-packaged-launch.mjs --upload-integrity"
}
```

The mode uses an isolated Windows HOME and the real packaged executable. In its
normal instance it authenticates, uploads a generic payload, verifies returned
path size/SHA-256 and same-directory committed location, then opens a raw upload,
sends a partial declared body, polls until the exact reserved staged path exists,
disconnects, and verifies that same path is unlinked. This pre-existence assertion
prevents an abort-before-storage false pass. It also creates an aged reserved staged file and verifies native
manual cleanup deletes it while a committed `*.part` file survives the staged
classifier.

Restart a second packaged instance with `CODEXMUX_UPLOADS_DISABLED=1`, confirm both
exact upload routes return 503, and confirm health plus one authenticated
non-upload API remain available. Propagate the environment into the actual
packaged server process. Add `windows-upload-integrity` to
`getWindowsPackageGateSteps()` so the package gate cannot pass without native
hard-link/delete/abort and kill-switch evidence.

- [x] **Step 4: Run Windows gate unit tests GREEN**

```bash
corepack pnpm exec vitest run tests/unit/scripts/windows-packaged-launch-smoke-lib.test.ts tests/unit/scripts/windows-package-gate-lib.test.ts
```

Expected: mode selection, required package script, ordering, and failure behavior
pass.

- [x] **Step 5: Run the Linux-available full matrix**

```bash
corepack pnpm audit --prod
corepack pnpm check:project-design
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
corepack pnpm smoke:browser-reconnect
corepack pnpm check:upload-memory
CODEXMUX_UPLOAD_SMOKE_MODE=development corepack pnpm smoke:upload-integrity
CODEXMUX_UPLOAD_SMOKE_MODE=production corepack pnpm smoke:upload-integrity
corepack pnpm build:electron
xvfb-run -a corepack pnpm smoke:electron:runtime-v2
git diff --check
```

Expected: every available gate passes. Record any environment-only skipped gate
with the exact reason and do not represent it as passing.

- [ ] **Step 6: Run the mandatory fresh Windows commands**

Run on a fresh Windows runner before ADR verification/operate:

```bash
corepack pnpm smoke:windows:updater-local-feed
corepack pnpm smoke:windows:packaged-launch
corepack pnpm smoke:windows:upload-integrity
corepack pnpm smoke:windows:package-gate
corepack pnpm smoke:windows:release-gate
```

If no Windows runner is available, leave ADR-027 at `Implemented` and lifecycle
release/operate pending. Linux evidence cannot waive this requirement.

## Task 10: Canonical Documentation And Operations Handoff

**Files:**

- Modify: `docs/ADR.md`
- Modify: `CONTEXT.md`
- Modify: `docs/README.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- Modify: `docs/FOLLOW-UP.md`
- Modify: `docs/PURPLEMUX-ADOPTION-AUDIT.md`
- Create: `docs/operations/2026-07-11-production-security-upload-integrity-handoff.md`

- [x] **Step 1: Update implementation truth after tests pass**

Document outer route ownership, auth/Origin/framing order, admission limits,
timeout values, staged/final naming, cleanup ownership, kill switch, development
and production data flow, dependency pins, and exact verification commands. Correct
the audit's former raw-body-overhead explanation to the reproduced proxy clone
crossing-chunk behavior.

- [x] **Step 2: Advance lifecycle states without overstating Windows evidence**

Engineering plan review advances ADR-027 from `Review` to `Approved` before code.
Completed implementation and Linux gates advance it to `Implemented`. Only fresh
Windows evidence advances it to `Verified`. The operations handoff explicitly lists
pending Windows evidence and the forward-only rollback using
`CODEXMUX_UPLOADS_DISABLED=1`.

- [x] **Step 3: Run documentation and diff checks**

```bash
corepack pnpm check:project-design
rg -n -e 'TO[D]O' -e 'TB[D]' -e 'FIXM[E]' -e '결정 필[요]' -e '미[정]' -e 'placeholde[r]' \
  docs/superpowers/plans/2026-07-11-production-security-upload-integrity.md \
  docs/superpowers/specs/2026-07-11-production-security-upload-integrity-design.md \
  docs/operations/2026-07-11-production-security-upload-integrity-handoff.md \
  CONTEXT.md docs/ADR.md
git diff --check
git status --short
```

Expected: governance and whitespace checks pass; no unresolved implementation
marker remains; unrelated user changes remain untouched.

## Engineering Review Checklist

- Dependency and upload checkpoints have separate failure evidence and verification.
- Every new production behavior has an observed RED test before implementation.
- Raw target matching happens before URL normalization only to classify/quarantine.
- Outer source/bootstrap guard precedes upload credentials and body/storage work.
- Credential, Origin, method, framing, refresh, admission, and storage order is fixed.
- Node HTTP parser limitations are represented accurately; no impossible OWS check
  or post-framing extra-octet counter is claimed.
- One upload server instance owns admission, transactions, timers, and shutdown.
- Staged and committed cleanup never overlap by filename or age policy.
- Successful hard-link publication is the only commit point and never gets rolled back on response
  disconnect.
- Dev, production proxy, internal standalone, Expect, pipelining, and kill-switch
  behavior all have black-box evidence.
- Memory evidence is process-isolated and compatible with Node 20.
- Windows evidence remains an explicit release boundary.

## Plan Self-Review

- Spec coverage: all 17 acceptance criteria map to Tasks 1 through 10.
- Placeholder scan: the plan contains no deferred implementation decision.
- Type consistency: names and discriminated results match the approved spec.
- Scope: UI/locales/status and unrelated dependency upgrades remain excluded.
- Project policy: no implicit commit/push/deploy step is present.
