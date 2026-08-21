# Pre-Auth Bootstrap Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Project policy overrides generic skill templates: do not commit or
> push unless the user explicitly asks.

**Goal:** Make fresh/setup codexmux reachable only through a local, same-authority
bootstrap boundary and make `/api/install` fail closed without regressing configured
sessions or Runtime v2 WebSockets.

**Architecture:** Separate strict config/auth state, process bootstrap latches,
request authority, install admission, upgrade routing, and install PTY execution.
Setup exposure is fixed to loopback at startup, first claim is one-way, install
authorization is repeated after upgrade, and PTY ownership uses an atomic
`idle | starting | active` slot with a revocable setup lease.

**Tech Stack:** TypeScript 5.9, Node HTTP/WebSocket (`ws`), Next.js 16 Pages Router
API routes with the existing custom server, `node-pty`, Vitest 4, pnpm.

---

## Inputs And Fixed Decisions

- Design spec:
  `docs/superpowers/specs/2026-07-11-pre-auth-bootstrap-security-design.md`
- Grill-me:
  `docs/superpowers/grill-me/2026-07-11-pre-auth-bootstrap-security.md`
- ADR: ADR-026 is `Review`; this plan's engineering review decides whether it can
  move to `Approved`.
- No product UI files or locale messages change in this slice.
- No dependency upgrade or upload path work is included.
- No commit/push step is executed without a separate user request.

## Execution Environment Constraints

- Planning host: Ubuntu Linux 6.8, x86_64, Node `v24.15.0`, pnpm `10.32.1`.
- Project engine floor remains Node `>=20.0.0`; implementation must not use Node 24-only APIs.
- Available planning resources: 62 GiB RAM, 1.1 TiB free workspace storage.
- Runtime targets: current Linux user service/dev server and Windows Electron
  packaging. macOS/Linux install commands remain legacy behavior; Windows
  host-owned installation remains out of scope.
- Filesystem: config uses same-directory temporary file + rename. Tests must not
  use chmod as the sole EACCES proof because root/Windows CI differs; inject or
  mock the read failure.
- Network: no trusted proxy contract. Forwarded headers are ignored. Browser
  authority is Host + Origin hostname/effective port only.
- Production custom server proxies to an internal Next standalone listener, so
  duplicate raw headers and setup Host policy must be checked before proxying and
  repeated in the Pages API route where possible.
- Existing smoke scripts run in parallel-unsafe isolated HOME/tmux/server contexts;
  the new live smoke must run alone.

## Next.js Version Contract Read

Before implementation, the local Next 16 documentation was checked:

- `node_modules/next/dist/docs/02-pages/02-guides/custom-server.md`
- `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/07-api-routes.md`
- `node_modules/next/dist/docs/02-pages/04-api-reference/02-file-conventions/proxy.md`

The relevant contract is that Pages API requests are Node `IncomingMessage`
instances and body parsing is content-type driven. Default absence of CORS response
headers does not replace explicit CSRF/Origin validation.

## File Map

Create:

- `src/lib/bootstrap-state.ts`
- `src/lib/request-authority.ts`
- `src/lib/bootstrap-request-guard.ts`
- `src/lib/install-request-auth.ts`
- `src/lib/server-bootstrap.ts`
- `tests/unit/lib/config-store.test.ts`
- `tests/unit/lib/auth-credentials.test.ts`
- `tests/unit/lib/bootstrap-state.test.ts`
- `tests/unit/lib/request-authority.test.ts`
- `tests/unit/lib/bootstrap-request-guard.test.ts`
- `tests/unit/lib/access-filter.test.ts`
- `tests/unit/lib/install-request-auth.test.ts`
- `tests/unit/lib/install-server.test.ts`
- `tests/unit/lib/server-bootstrap.test.ts`
- `tests/unit/pages/auth-setup.test.ts`
- `tests/unit/pages/auth-preflight.test.ts`
- `tests/unit/scripts/setup-origin-contract.test.ts`
- `scripts/smoke-pre-auth-bootstrap-security.mjs`

Modify:

- `src/lib/config-store.ts`
- `src/lib/auth-credentials.ts`
- `src/lib/network-access.ts`
- `src/lib/access-filter.ts`
- `src/lib/runtime/server-ws-upgrade.ts`
- `src/lib/install-server.ts`
- `src/pages/api/auth/setup.ts`
- `src/pages/api/auth/preflight.ts`
- `src/proxy.ts`
- `server.ts`
- `tests/unit/lib/runtime/server-ws-upgrade.test.ts`
- `tests/unit/proxy-config.test.ts`
- `package.json`
- the 13 existing smoke scripts listed in Task 8
- architecture/operations docs listed in Task 9

## Task 1: Strict Config And Auth Bootstrap State

**Files:**

- Create: `tests/unit/lib/config-store.test.ts`
- Create: `tests/unit/lib/auth-credentials.test.ts`
- Modify: `src/lib/config-store.ts`
- Modify: `src/lib/auth-credentials.ts`

- [ ] **Step 1: Add RED config state matrix tests**

Use a temporary `HOME`, clear `globalThis.__ptConfigLock` and
`globalThis.__ptConfigContentCache`, call `vi.resetModules()`, then import the
module. Cover these exact cases:

```typescript
const cases = [
  [{}, { mode: 'setup-required', authSecret: null }],
  [{ authSecret: 'secret' }, { mode: 'setup-required', authSecret: 'secret' }],
  [{ authPassword: 'legacy-sha512', authSecret: 'secret' }, { mode: 'setup-required', authSecret: 'secret' }],
  [{ authPassword: VALID_HASH, authSecret: 'secret' }, { mode: 'configured', passwordHash: VALID_HASH, authSecret: 'secret' }],
] as const;
```

Also assert:

- valid scrypt hash without `authSecret` resolves `invalid/missing-auth-secret`;
- malformed `scrypt:` resolves `invalid/malformed-scrypt-hash`;
- non-string auth fields resolve `invalid/invalid-auth-field`;
- `readConfig()` returns `null` only for ENOENT;
- malformed JSON, non-object JSON and injected EACCES reject without file mutation;
- delete-after-write + cached content still lets `initConfigStore()` recreate the file;
- `updateConfig()` does not create/overwrite a missing or malformed initialized config;
- `verifyPassword()` returns false instead of throwing for malformed hash.

- [ ] **Step 2: Run config tests and confirm RED**

Run:

```bash
corepack pnpm test -- tests/unit/lib/config-store.test.ts
```

Expected: FAIL because `resolveStoredAuthState` does not exist and config errors are
currently collapsed to `null`.

- [ ] **Step 3: Implement strict config read and state resolver**

Add these public types and exact hash validation:

```typescript
export type TStoredAuthState =
  | { mode: 'setup-required'; authSecret: string | null }
  | { mode: 'configured'; passwordHash: string; authSecret: string }
  | {
      mode: 'invalid';
      reason: 'missing-auth-secret' | 'malformed-scrypt-hash' | 'invalid-auth-field';
    };

const SCRYPT_HASH_RE = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/;

export const isHashedPassword = (value: string | undefined | null): boolean =>
  typeof value === 'string' && SCRYPT_HASH_RE.test(value);
```

Refactor `readConfig()` so only an `ENOENT` error returns `null`. Validate that the
JSON root is a non-null, non-array object. `initConfigStore()` returns the validated
existing/new `IConfigData`, clears the content cache only in the ENOENT creation
branch, and never writes after parse/I/O failure. `updateConfig()` throws if the
file is missing/invalid instead of substituting `emptyConfig()`.

`resolveStoredAuthState()` must preserve non-scrypt legacy password reset behavior,
but treat a malformed value beginning with `scrypt:` as invalid.

Add a strict runtime reader used by admission paths:

```typescript
export const readStoredAuthState = async (): Promise<TStoredAuthState> => {
  const config = await readConfig();
  if (!config) throw new Error('config-unavailable');
  return resolveStoredAuthState(config);
};
```

`needsSetup()` delegates to this resolver: setup-required is true, configured is
false, and invalid/missing/read failure rejects rather than coercing to setup.

- [ ] **Step 4: Add RED auth bootstrap tests**

Cover:

```typescript
type TAuthBootstrapState =
  | { mode: 'setup-open' }
  | { mode: 'init-password'; passwordHash: string; secret: string }
  | { mode: 'configured'; passwordHash: string; secret: string };
```

Export `TAuthBootstrapState` from `auth-credentials.ts`; it is consumed by the
bootstrap-state and server-bootstrap modules.

Test configured + INIT precedence/deletion, empty and secret-only setup, valid INIT
hashing/secret reuse, short INIT rejection without mutation, invalid stored state
not bypassed by INIT, and secret persistence failure propagation. Runtime
`AUTH_PASSWORD`/`NEXTAUTH_SECRET` application is tested only in Task 7's
`server-bootstrap.ts` composition.

- [ ] **Step 5: Implement `initAuthCredentials(config)`**

Change the signature to:

```typescript
export const initAuthCredentials = async (
  config: IConfigData,
): Promise<TAuthBootstrapState> => {};
```

Configured state deletes `INIT_PASSWORD` and wins. Setup with no INIT returns
`setup-open`. Valid INIT returns
`init-password`, persisting a secret only when missing. A present INIT shorter than
`MIN_PASSWORD_LENGTH` throws a sanitized startup error instead of opening setup.

- [ ] **Step 6: Run Task 1 tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/lib/config-store.test.ts tests/unit/lib/auth-credentials.test.ts
```

Expected: both files pass; malformed fixtures remain byte-for-byte unchanged.

## Task 2: Bootstrap Latches And Request Authority

**Files:**

- Create: `src/lib/bootstrap-state.ts`
- Create: `src/lib/request-authority.ts`
- Create: `tests/unit/lib/bootstrap-state.test.ts`
- Create: `tests/unit/lib/request-authority.test.ts`
- Modify: `src/lib/network-access.ts`

- [ ] **Step 1: Add RED bootstrap latch tests**

Define and test an internal process-env contract that is overwritten at every server
startup and transitions claim pending only from true to false:

```typescript
export interface IBootstrapRuntimeState {
  startedInSetup: boolean;
  claimPending: boolean;
  initSessionRequired: boolean;
}

initializeBootstrapRuntimeState('setup-open');
expect(getBootstrapRuntimeState()).toEqual({
  startedInSetup: true,
  claimPending: true,
  initSessionRequired: false,
});
markBootstrapClaimed();
expect(getBootstrapRuntimeState().claimPending).toBe(false);
```

Assert `configured` starts claimed, `init-password` requires a session, repeated
claim close is idempotent, and inherited `__CMUX_BOOTSTRAP_*` values are overwritten.
Missing or malformed internal env values must throw/fail closed; they must never
default to claim-open.

- [ ] **Step 2: Implement `bootstrap-state.ts`**

Use namespaced process env keys rather than a new `globalThis` singleton. Export the
runtime type plus these functions:

```typescript
export const initializeBootstrapRuntimeState = (mode: TAuthBootstrapState['mode']): void => {};
export const getBootstrapRuntimeState = (): IBootstrapRuntimeState => {};
export const markBootstrapClaimed = (): void => {};
```

Do not store password hashes, cookies or secrets in these keys.

- [ ] **Step 3: Add RED authority parser table tests**

Build requests with explicit `rawHeaders`. Cover one valid Host/Origin pair for
`localhost`, `127.0.0.1`, `[::1]`, plus:

- missing/duplicate Host;
- missing/duplicate/`null` Origin;
- mixed-case header names;
- userinfo, path, query, fragment, whitespace, backslash and invalid ports;
- authority port mismatch;
- `http://localhost:80` default-port normalization;
- legacy numeric IPv4 such as `2130706433` and short `127.1` rejection;
- strict dotted IPv4, bracketed IPv6, `::ffff:127.0.0.1` socket loopback.

- [ ] **Step 4: Implement request authority value parsing**

Expose separate Host-only and Host+Origin operations so the outer server can protect
all setup HTTP requests without requiring Origin on GET:

```typescript
export type TRequestAuthorityResult =
  | { valid: true; authority: string; loopbackHost: boolean }
  | {
      valid: false;
      statusCode: 400 | 403;
      reason: TRequestAuthorityRejectionReason;
    };

export const validateSingleRequestHost = (request: Pick<IncomingMessage, 'rawHeaders'>): TRequestAuthorityResult => {};
export const validateBrowserRequestAuthority = (
  request: Pick<IncomingMessage, 'rawHeaders'>,
  options: { requireLoopbackHost: boolean },
): TRequestAuthorityResult => {};
```

Count raw header occurrences case-insensitively. Parse Origin first, then parse Host
under the Origin protocol so default/effective port comparison is correct. Ignore all
forwarded headers.

- [ ] **Step 5: Export a pure socket loopback helper**

Move no parsing state into the helper:

```typescript
export const isLoopbackAddress = (address: string | undefined | null): boolean => {};
```

Support `127/8`, `::1`, and IPv4-mapped `127/8`; reject missing/malformed addresses.

- [ ] **Step 6: Run Task 2 tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/lib/bootstrap-state.test.ts tests/unit/lib/request-authority.test.ts
```

Expected: all table cases pass without reading forwarded headers.

## Task 3: Startup Exposure And Outer HTTP/WS Guard

**Files:**

- Create: `src/lib/bootstrap-request-guard.ts`
- Create: `tests/unit/lib/bootstrap-request-guard.test.ts`
- Create: `tests/unit/lib/access-filter.test.ts`
- Modify: `src/lib/access-filter.ts`

- [ ] **Step 1: Add RED access-filter tests**

Test the new signature:

```typescript
initAccessFilter({
  envHost: '0.0.0.0',
  networkAccess: 'all',
  setupRequiredAtStartup: true,
});
expect(getCurrentSpec().allowAll).toBe(false);
expect(isRequestAllowed('127.0.0.1')).toBe(true);
expect(isRequestAllowed('192.168.1.10')).toBe(false);
```

Configured cases must preserve HOST, `networkAccess`, missing-access default, cache
invalidation, and `updateAccessFromConfig` behavior.

- [ ] **Step 2: Implement immutable startup restriction**

Add:

```typescript
export interface IInitAccessFilterOptions {
  envHost?: string;
  networkAccess?: TNetworkAccess;
  setupRequiredAtStartup: boolean;
}
```

Keep a module-local `setupRestrictedAtStartup` set only by `initAccessFilter()`.
`resolveSource()` returns `localhost` before consulting HOST/config while it is true.
Do not release this source restriction after claim; the listener cannot expand until restart.

- [ ] **Step 3: Add RED outer guard tests**

`validateOuterBootstrapRequest()` must:

- pass through all requests when claim is closed;
- while claim is pending, reject non-loopback/malformed Host on every HTTP/WS request;
- for POST `/api/auth/setup`, require a same-authority Origin and JSON media type;
- reject form-urlencoded setup CSRF with `415`;
- return `503/bootstrap-state-unavailable` when internal latch state is missing/malformed;
- never consult forwarded Host/Proto/For.

- [ ] **Step 4: Implement `bootstrap-request-guard.ts`**

Use a total result:

```typescript
export type TBootstrapRequestGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 400 | 403 | 415 | 503;
      reason: TBootstrapRequestRejectionReason;
    };

export const validateOuterBootstrapRequest = (
  request: IncomingMessage,
): TBootstrapRequestGuardResult => {};

export const validateSetupPostRequest = (
  request: Pick<IncomingMessage, 'headers' | 'rawHeaders'>,
): TBootstrapRequestGuardResult => {};
```

Accept `application/json` with optional parameters and reject other media types.

- [ ] **Step 5: Run Task 3 tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/lib/access-filter.test.ts tests/unit/lib/bootstrap-request-guard.test.ts
```

Expected: setup startup always resolves localhost; configured behavior is unchanged.

## Task 4: Setup And Preflight First-Claim Security

**Files:**

- Create: `tests/unit/pages/auth-setup.test.ts`
- Create: `tests/unit/pages/auth-preflight.test.ts`
- Modify: `src/pages/api/auth/setup.ts`
- Modify: `src/pages/api/auth/preflight.ts`

- [ ] **Step 1: Add RED API handler tests**

Mock config/auth/access/bootstrap dependencies and create Next requests with raw headers.
Cover:

- GET setup-open and init-password response;
- configured or already-claimed GET does not reopen onboarding;
- POST missing exposure/claim latch returns `409` before write;
- form POST returns `415`;
- missing/attacker Origin and public Host return `403`;
- missing password returns `400` only after request admission;
- INIT mode missing session returns `401`;
- strict state read failure returns `503` and update count stays zero;
- password shorter than `MIN_PASSWORD_LENGTH` returns `400` before hashing;
- two concurrent valid POSTs with a deferred first write produce one success, one `409`,
  one config write and one claim close;
- valid local same-authority JSON writes hash+secret, updates runtime auth/network state,
  then calls `markBootstrapClaimed()` exactly once;
- failed config write never closes the claim latch.

- [ ] **Step 2: Run setup API test RED**

Run:

```bash
corepack pnpm test -- tests/unit/pages/auth-setup.test.ts
```

Expected: FAIL because the route accepts form/cross-site first claims and has no latch.

- [ ] **Step 3: Implement route-level defense in depth**

At the start of POST, call `validateSetupPostRequest(req)`. Acquire the existing setup
lock before relying on the latch. The exact sequence inside the lock is:

1. re-read and require `startedInSetup && claimPending`;
2. read canonical stored auth state; `null`/invalid/read failure is `503`, configured is `409`;
3. require INIT session when `initSessionRequired`;
4. validate password/min length and other input;
5. hash password and atomically write hash+secret/config;
6. set `AUTH_PASSWORD` and `NEXTAUTH_SECRET`, delete `INIT_PASSWORD`;
7. call `updateAccessFromConfig()` when selected;
8. call `markBootstrapClaimed()` as the last synchronous side effect.

The latch precheck is:

```typescript
const runtimeState = getBootstrapRuntimeState();
if (!runtimeState.startedInSetup || !runtimeState.claimPending) {
  return res.status(409).json({ error: 'setup-restart-required' });
}
```

Read the strict stored state. Only `setup-required` proceeds. If
`initSessionRequired`, verify the session. A failed config write leaves auth env,
access env and claim latch unchanged.

GET must not advertise a fresh claim after the latch is closed even if config fields
are removed while the process is running. Its exact response uses
`needsSetup: storedState.mode === 'setup-required' && claimPending`; a closed latch
returns `needsSetup:false` and `requiresAuth:false`.

- [ ] **Step 4: Add RED preflight admission tests**

Mock `getCachedPreflightStatus`, canonical stored auth state, runtime latch, session
and CLI auth. Assert:

- setup-open + setup-required can read preflight without session;
- init-password + setup-required requires a valid session;
- claim closed or stored configured requires CLI/session auth;
- claim closed plus runtime config removal does not reopen public preflight;
- missing/invalid/read failure returns `503` without calling preflight work.

- [ ] **Step 5: Replace `needsSetup()`-only preflight policy**

`auth/preflight.ts` must read canonical stored state and runtime latch. Only
`startedInSetup && claimPending && setup-required` receives onboarding admission;
INIT mode additionally requires session. All other valid states use the existing
CLI/session auth path.

- [ ] **Step 6: Run setup/preflight API tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/pages/auth-setup.test.ts tests/unit/pages/auth-preflight.test.ts
```

Expected: all state, CSRF, concurrent latch, preflight and failure-order tests pass.

## Task 5: Install Admission And Typed Upgrade Routing

**Files:**

- Create: `src/lib/install-request-auth.ts`
- Create: `tests/unit/lib/install-request-auth.test.ts`
- Modify: `src/lib/runtime/server-ws-upgrade.ts`
- Modify: `tests/unit/lib/runtime/server-ws-upgrade.test.ts`
- Modify: `src/proxy.ts`
- Modify: `tests/unit/proxy-config.test.ts`

- [ ] **Step 1: Add RED install authorizer table tests**

Use this public contract:

```typescript
export type TInstallAuthorizationMode = 'setup-local' | 'authenticated';

export type TInstallRequestAuthorization =
  | { authorized: true; mode: TInstallAuthorizationMode }
  | {
      authorized: false;
      statusCode: 400 | 401 | 403 | 503;
      reason: TInstallRequestRejectionReason;
    };

export type TAuthorizeInstallRequest = (
  request: IncomingMessage,
) => Promise<TInstallRequestAuthorization>;
```

Test setup-open local success; remote socket/public Host rejection; INIT session
required; configured session required; same-authority enforcement in both modes;
closed claim + setup stored state never returns setup-local; state/session dependency
throws return `503`; and no cookie/origin value appears in the result.

- [ ] **Step 2: Implement authorizer factory**

```typescript
export interface IInstallRequestAuthorizerDependencies {
  readStoredAuthState: () => Promise<TStoredAuthState>;
  getBootstrapState: () => IBootstrapRuntimeState;
  verifySession: (cookieHeader: string | undefined) => Promise<boolean>;
  isLoopbackAddress: (address: string | undefined | null) => boolean;
}

export const createInstallRequestAuthorizer = (
  dependencies?: Partial<IInstallRequestAuthorizerDependencies>,
): TAuthorizeInstallRequest => {};
```

Request authority validation runs before session validation. A setup-local result
requires `startedInSetup`, claim pending, canonical `setup-required`, loopback socket
and Host, and INIT session when configured. The default stored-state reader treats a
missing file after startup as unavailable and never as setup. All dependency errors become
`503/install-auth-unavailable`.

Also export the canonical lease check used by the install server:

```typescript
export type TInstallSetupLeaseState = 'valid' | 'completed' | 'unavailable';

export const createInstallSetupLeaseChecker = (
  dependencies?: Partial<Pick<IInstallRequestAuthorizerDependencies,
    'readStoredAuthState' | 'getBootstrapState'>>,
): (() => Promise<TInstallSetupLeaseState>) => {};
```

`setup-required` plus an open startup claim is valid; configured/closed claim is
completed; missing/invalid/read failure is unavailable.

- [ ] **Step 3: Add RED upgrade routing tests**

Replace the old no-auth install fixture. Assert routing order:

1. invalid request target;
2. Runtime v2 namespace;
3. `/api/install` authorizer;
4. generic auth;
5. known/fallback route.

Test rejection does not call any upgrade callback, authorizer throw returns bounded
503 JSON, and success passes this immutable context:

```typescript
interface IInstallWebSocketUpgradeContext {
  route: 'install';
  url: URL;
  authorization: { authorized: true; mode: TInstallAuthorizationMode };
}
```

- [ ] **Step 4: Implement typed install route**

Remove `noAuthPaths` from route/factory options and delete the generic fast path.
Add required `authorizeInstallRequest` and `handleInstallUpgrade` callbacks. Install
must not call `handleKnownUpgrade`, even when generic WS sets accidentally contain it.
Keep existing Runtime v2 and generic auth semantics unchanged.

- [ ] **Step 5: Remove the Next HTTP install exception**

Delete `api/install` from `src/proxy.ts`'s negative matcher. Extend
`tests/unit/proxy-config.test.ts`:

```typescript
expect(matchesProxy('/api/install')).toBe(true);
expect(matchesProxy('/api/auth/setup')).toBe(false);
```

WebSocket install remains intercepted by the custom server before the Next proxy.

- [ ] **Step 6: Run Task 5 tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/lib/install-request-auth.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts tests/unit/proxy-config.test.ts
```

Expected: install route is structurally separate; existing Runtime v2 tests pass.

## Task 6: Atomic Install PTY Slot And Setup Lease

**Files:**

- Create: `tests/unit/lib/install-server.test.ts`
- Modify: `src/lib/install-server.ts`

- [ ] **Step 1: Build fake WebSocket, PTY and scheduler fixtures**

The fake PTY must expose `onData`, `onExit`, `write`, `resize`, `kill`/`destroy` call
counts. The scheduler must run/cancel named tasks deterministically. The injected
spawn function must support a deferred Promise to prove `starting` races.

- [ ] **Step 2: Add RED admission and command tests**

Assert zero spawn for missing context, fresh reauthorization rejection, mode drift,
missing/duplicate command, platform-unknown command, and prototype keys
`constructor`, `__proto__`, `toString`.

The handler signature is:

```typescript
interface IInstallConnectionContext {
  url: URL;
  admittedMode: TInstallAuthorizationMode;
}

interface IInstallServer {
  handleConnection(
    ws: WebSocket,
    request: IncomingMessage,
    context: IInstallConnectionContext | null | undefined,
  ): Promise<void>;
  shutdown(): void;
}
```

Production passes only typed non-null context; the wider handler input keeps a
runtime defense against untyped EventEmitter/manual calls. Validate `URL` and mode
synchronously, attach close/error/message guards before the first await, and recheck
the early-close/overflow flag after every await.

The factory dependency contract is fixed as:

```typescript
interface IInstallScheduledTask {
  cancel(): void;
}

interface IInstallServerDependencies {
  authorizeRequest: TAuthorizeInstallRequest;
  checkSetupLease: () => Promise<TInstallSetupLeaseState>;
  spawnPty: (
    shell: string,
    args: string[] | string,
    options: pty.IPtyForkOptions | pty.IWindowsPtyForkOptions,
  ) => pty.IPty | Promise<pty.IPty>;
  scheduleTask: (
    name: 'command' | 'lease',
    callback: () => void | Promise<void>,
    delayMs: number,
  ) => IInstallScheduledTask;
  platform: NodeJS.Platform;
}

export const createInstallServer = (
  dependencies: Partial<IInstallServerDependencies> = {},
): IInstallServer => {};
```

Production defaults are the default authorizer, default setup lease checker,
`pty.spawn`, cancelable production scheduler and `process.platform`. Explicit test or
server dependencies override only the supplied fields.

- [ ] **Step 3: Add RED execution-slot race tests**

Cover:

- deferred first spawn reserves `starting`; second closes `1013` and cannot kill first;
- first socket closes before spawn resolves; second succeeds; late first PTY alone is destroyed;
- spawn rejection returns slot to idle;
- active second connection closes itself without affecting existing PTY;
- stale exit/timer callback from old owner cannot clear/kill a new owner;
- close during reauthorization produces no reserve/spawn;
- shutdown during deferred spawn rejects new admission and destroys only the late PTY;
- shutdown during starting/active is idempotent;
- top-level handler error performs owner-specific cleanup before close.

- [ ] **Step 4: Implement `createInstallServer()` and atomic slot**

Use this state:

```typescript
type TInstallSlot =
  | { state: 'idle' }
  | { state: 'starting'; owner: symbol; ws: WebSocket; closed: boolean }
  | { state: 'active'; owner: symbol; connection: IActiveInstallConnection };
```

After fresh authorization and selector validation, perform synchronous
check-and-reserve before any spawn await. Every async continuation checks owner,
socket state and shutdown state. Cleanup can clear the slot only when owner matches.

Use `Object.hasOwn(INSTALL_COMMANDS, command)`. Remove command text from start/exit
logs.

- [ ] **Step 5: Add RED setup lease/input tests**

Cover transition/read failure:

- before spawn and after deferred spawn;
- before 300ms command write;
- before stdin and resize;
- on recursive watcher;
- repeated close/error/exit/shutdown.

Expected results: completed closes `1000`, unavailable closes `1011`, and no later
PTY write/resize occurs.

If a setup-local admission becomes non-setup during the second authorizer call,
consult `checkSetupLease()`: completed closes `1000`, unavailable closes `1011`, and
only a still-valid lease with a different auth result closes `1008`.

Use these exact queue boundaries:

```typescript
export const INSTALL_MAX_FRAME_BYTES = 64 * 1024;
const MAX_QUEUED_INSTALL_FRAMES = 256;
const MAX_QUEUED_INSTALL_BYTES = 1024 * 1024;
```

Test initial query and binary resize independently clamp to `500x200`; exactly
65,536 message bytes are accepted, 65,537 closes `1009`; aggregate frame/byte queue
overflow closes `1011 Install input backpressure` and every pending continuation
becomes a no-op.

- [ ] **Step 6: Implement lease, bounded queue and cleanup ownership**

Use cancelable recursive one-shot scheduling, not async `setInterval`. Active
connection owns PTY disposables, command task, lease task, message queue counters and
cleanup flag. Register socket close/error and bounded message collection before the
first handler await. Serialize lease check + message execution through one Promise
chain in arrival order. Keep an error listener or noop error sink for the socket's
full lifetime so a post-cleanup error cannot become an unhandled exception.

- [ ] **Step 7: Run Task 6 tests GREEN**

Run:

```bash
corepack pnpm test -- tests/unit/lib/install-server.test.ts
```

Expected: deterministic race/lease/cleanup suite passes without real shell processes.

## Task 7: Custom Server Wiring And Startup Logs

**Files:**

- Create: `src/lib/server-bootstrap.ts`
- Create: `tests/unit/lib/server-bootstrap.test.ts`
- Modify: `server.ts`
- Modify: `src/lib/runtime/server-ws-upgrade.ts`
- Modify: `tests/unit/lib/runtime/server-ws-upgrade.test.ts`

- [ ] **Step 1: Add RED server bootstrap composition tests**

Inject config init, shell-path init, auth bootstrap, env/latch/access functions and an
elevation probe. Cover:

- config and shell-path initialization both complete before auth composition;
- configured and init-password set runtime auth env;
- setup-open deletes inherited `AUTH_PASSWORD`/`NEXTAUTH_SECRET`;
- every run overwrites inherited `__CMUX_BOOTSTRAP_*` values;
- setup mode passes `setupRequiredAtStartup:true` even with `HOST=0.0.0.0`;
- malformed/hash-only/short INIT failure never initializes listener access;
- detectable elevated/root setup-open without INIT fails startup;
- dependency errors propagate without partial claim-open defaults.

- [ ] **Step 2: Implement `server-bootstrap.ts` as the single owner**

Keep shell initialization and avoid stale config re-read:

```typescript
const [configData] = await Promise.all([
  initConfigStore(),
  initShellPath(),
]);
const authBootstrap = await initAuthCredentials(configData);

if (authBootstrap.mode === 'setup-open' && isDetectablyElevated()) {
  throw new Error('INIT_PASSWORD is required for elevated setup');
}

applyAuthBootstrapEnv(authBootstrap);
initializeBootstrapRuntimeState(authBootstrap.mode);

initAccessFilter({
  envHost: process.env.HOST?.trim(),
  networkAccess: configData.networkAccess,
  setupRequiredAtStartup: authBootstrap.mode !== 'configured',
});
```

`applyAuthBootstrapEnv()` first deletes both runtime auth variables, then sets them
only for init-password/configured. Export a dependency-injected
`initializeServerBootstrap()` returning only `authBootstrap` and network/log metadata;
do not expose the potentially stale pre-INIT config as a general source. `server.ts`
removes the later `getConfig()` import/read and calls this initializer before Next dev
prepare or production standalone require.

- [ ] **Step 3: Define typed WebSocket outer access guard**

Replace `isRequestAllowed(remoteAddress)` plus `rejectSocket` options with:

```typescript
export type TUpgradeRequestGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 400 | 403 | 415 | 503;
      reason: TBootstrapRequestRejectionReason | 'source-forbidden';
    };

validateUpgradeRequest: (
  request: IncomingMessage,
) => TUpgradeRequestGuardResult;
```

`server.ts` composes source filtering first and `validateOuterBootstrapRequest()`
second. The factory emits bounded JSON with the exact status/reason before route
parsing. Extend factory tests for source 403, malformed Host 400 and unavailable
latch 503.

- [ ] **Step 4: Apply outer request guard in dev and prod**

For every HTTP request, run source filter then `validateOuterBootstrapRequest()`
before Next handling/proxying. Return a small JSON response with the guard status and
machine reason. WebSocket uses the typed full-request guard above.

- [ ] **Step 5: Give each server one install service owner**

`createWsServers()` creates one authorizer, one install lease checker and one
`createInstallServer()` instance, then returns that install server with its WSS:

```typescript
const createWsServers = () => {
  const authorizeInstallRequest = createInstallRequestAuthorizer();
  const installServer = createInstallServer({
    authorizeRequest: authorizeInstallRequest,
    checkSetupLease: createInstallSetupLeaseChecker(),
  });
  const installWss = new WebSocketServer({
    noServer: true,
    maxPayload: INSTALL_MAX_FRAME_BYTES,
  });
  return { /* existing servers */, installWss, installServer, authorizeInstallRequest };
};
```

Remove install from both generic path sets. On typed install success, call
`handleUpgrade` and then invoke the install server directly with the typed URL/mode;
do not send context through an untyped EventEmitter argument. Delete the old install
`connection` listener and generic `handleWsUpgrade` install branch.

`shutdownWs(servers)` calls that same `servers.installServer.shutdown()` before the
remaining WebSocket shutdown helpers. Dev and production shutdown closures pass their
own returned server set.

- [ ] **Step 6: Update startup output**

When setup-restricted, output only the actual loopback URL and separate deferred
configuration:

```text
Security: setup mode, loopback-only
Deferred: HOST=<value> applies after setup and restart
```

Configured output keeps the existing available URLs/access information. Do not log
passwords, cookies, Origin or install command selectors.

- [ ] **Step 7: Run focused server tests**

Run:

```bash
corepack pnpm test -- tests/unit/lib/server-bootstrap.test.ts tests/unit/lib/access-filter.test.ts tests/unit/lib/bootstrap-request-guard.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts
corepack pnpm tsc --noEmit
```

Expected: focused tests and typecheck pass.

## Task 8: Browser-Like Setup Smokes And Live Dev/Prod Attack Smoke

**Files:**

- Modify: `scripts/smoke-android-runtime-v2-foreground.mjs`
- Modify: `scripts/smoke-android-timeline-foreground.mjs`
- Modify: `scripts/smoke-browser-reconnect-dom.mjs`
- Modify: `scripts/smoke-electron-runtime-v2.mjs`
- Modify: `scripts/smoke-permission-prompt.mjs`
- Modify: `scripts/smoke-runtime-v2-phase2-gate.mjs`
- Modify: `scripts/smoke-runtime-v2-storage-shadow.ts`
- Modify: `scripts/smoke-runtime-v2-timeline-live-shadow.ts`
- Modify: `scripts/smoke-runtime-v2-timeline-resume-safety.ts`
- Modify: `scripts/smoke-runtime-v2-timeline-session-changed.ts`
- Modify: `scripts/smoke-runtime-v2-timeline-shadow.ts`
- Modify: `scripts/smoke-runtime-v2-timeline-websocket-default.ts`
- Modify: `scripts/smoke-windows-packaged-launch.mjs`
- Create: `scripts/smoke-pre-auth-bootstrap-security.mjs`
- Create: `tests/unit/scripts/setup-origin-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Update existing Node setup clients**

The browser now must supply Origin. In each listed script's `jsonRequest()` helper,
send the request base origin for JSON requests:

```javascript
const headers = {
  ...(init.body ? {
    'Content-Type': 'application/json',
    Origin: new URL(baseUrl).origin,
  } : {}),
  // existing cookie/token/custom headers
};
```

Do not add Origin to unrelated WebSocket helpers unless their route requires it.

Add a static contract test containing the exact 13-file list. It reads every source
and asserts that a setup POST path is paired with browser-like Origin construction.
This prevents a future smoke helper from silently reverting to Originless setup.

- [ ] **Step 2: Write live smoke with isolated HOME**

The new script uses `HOST=0.0.0.0`, a free port, isolated HOME, and a scrubbed env. It
runs one mode selected by
`CODEXMUX_PREAUTH_SMOKE_MODE=development|production`.

Start commands are exact:

```text
development: corepack pnpm exec tsx server.ts
production:  node bin/codexmux.js
```

Before spawn, delete inherited `AUTH_PASSWORD`, `NEXTAUTH_SECRET`, `INIT_PASSWORD`,
`__CMUX_NETWORK_ACCESS`, `__CMUX_BOUND_HOST`, every `__CMUX_BOOTSTRAP_*`,
`__CMUX_APP_DIR`, `__CMUX_APP_DIR_UNPACKED`, and Runtime v2 mode/enable variables.
Then set only the scenario's explicit env and regenerate `__CMUX_PRISTINE_ENV`.

The smoke is privilege-aware. As non-root it executes the full no-INIT setup-open
flow. If `process.getuid?.() === 0`, it first requires no-INIT startup to fail, then
starts with a valid INIT password, logs in, and runs the remaining bind/Host/Origin,
install, claim and configured-restart checks. It records pure setup-open live
admission as a named root-host verification limit; unit/server-bootstrap coverage is
still required. Do not add a test-only elevation bypass.

Required assertions:

- loopback health succeeds and startup log reports loopback-only/deferred HOST;
- a discovered non-loopback interface cannot connect to the requested port;
- public Host HTTP request receives 403 before Next;
- form-urlencoded and attacker-Origin setup POST fail without changing config;
- same-authority JSON setup or install succeeds;
- local install WebSocket with command `git` opens, then closes within one second of
  successful setup;
- attacker Origin WebSocket is rejected before open;
- a 65,537-byte install message closes `1009`, cleans the PTY, and a subsequent valid
  install can acquire the slot;
- configured restart accepts valid login/session install and rejects no-session install;
- valid INIT mode rejects unauthenticated install/setup, permits login, then claim;
- malformed JSON and hash-only config make the process exit nonzero, preserve exact
  config bytes and never open the port;
- inherited stale runtime auth/bootstrap env cannot authenticate a fresh setup-open;
- occupied requested port fallback waits for `$HOME/.codexmux/port`, reads the actual
  port, and verifies that listener rather than probing the dummy requested-port server.

The script always stops children, removes temporary HOME unless explicitly preserved,
and prints a JSON check list without cookie/config content.

- [ ] **Step 3: Register the smoke script**

Add:

```json
"smoke:pre-auth-bootstrap": "node scripts/smoke-pre-auth-bootstrap-security.mjs"
```

- [ ] **Step 4: Run dev live smoke**

Run:

```bash
CODEXMUX_PREAUTH_SMOKE_MODE=development corepack pnpm smoke:pre-auth-bootstrap
```

Expected: JSON `{ "ok": true }` with all attack/bind/claim checks listed.

- [ ] **Step 5: Build and run production live smoke**

Run:

```bash
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
```

Expected: production standalone proxy path passes the same checks.

- [ ] **Step 6: Validate all modified smoke sources**

Run:

```bash
corepack pnpm test -- tests/unit/scripts/setup-origin-contract.test.ts
node --check scripts/smoke-android-runtime-v2-foreground.mjs
node --check scripts/smoke-android-timeline-foreground.mjs
node --check scripts/smoke-browser-reconnect-dom.mjs
node --check scripts/smoke-electron-runtime-v2.mjs
node --check scripts/smoke-permission-prompt.mjs
node --check scripts/smoke-runtime-v2-phase2-gate.mjs
node --check scripts/smoke-windows-packaged-launch.mjs
corepack pnpm tsc --noEmit
```

Expected: Origin contract, JavaScript syntax and TypeScript script compilation pass.

## Task 9: Architecture, Recovery And Test Documentation

**Files:**

- Modify: `docs/ADR.md`
- Modify: `docs/PROJECT-DESIGN.md`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/TMUX.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/SYSTEMD.md`
- Modify: `docs/WINDOWS-ONLY-GAP-AUDIT.md`

- [ ] **Step 1: Update ADR-026 after engineering approval**

Change ADR-026 from `Review` to `Approved` only if the engineering review below has
no blocker. Preserve trade-offs and the separate ADR lifecycle.

- [ ] **Step 2: Document implemented boundaries**

Record:

- strict config missing/invalid behavior and recovery without auto-overwrite;
- setup exposure/claim state and password reset requiring stopped server + restart;
- requested vs effective network access and deferred HOST/direct bind;
- setup POST CSRF/authority contract;
- preflight canonical state/latch/session contract and `/api/install` proxy protection;
- install admission, execution slot, close/error codes and arbitrary-stdin residual;
- user-scoped/non-elevated trust and Windows host-owned action gap;
- exact unit/live smoke commands and Linux-required, GUI-dependent, Windows-deferred gates.

- [ ] **Step 3: Run docs consistency checks**

Run:

```bash
rg -n "remote onboarding|NO_AUTH_WS_PATHS|setup-local|same-origin|same-authority|authPassword.*authSecret" \
  docs CONTEXT.md AGENTS.md
corepack pnpm check:project-design
git diff --check
```

Expected: no stale claim that remote onboarding works, no docs calling the new
authority check full same-origin, governance check and diff check pass.

## Task 10: Full Verification And Post-Implementation Review

**Files:** all files changed by Tasks 1-9.

- [ ] **Step 1: Run focused security suite**

```bash
corepack pnpm test -- \
  tests/unit/lib/config-store.test.ts \
  tests/unit/lib/auth-credentials.test.ts \
  tests/unit/lib/bootstrap-state.test.ts \
  tests/unit/lib/request-authority.test.ts \
  tests/unit/lib/bootstrap-request-guard.test.ts \
  tests/unit/lib/access-filter.test.ts \
  tests/unit/lib/server-bootstrap.test.ts \
  tests/unit/lib/install-request-auth.test.ts \
  tests/unit/lib/install-server.test.ts \
  tests/unit/lib/runtime/server-ws-upgrade.test.ts \
  tests/unit/pages/auth-setup.test.ts \
  tests/unit/pages/auth-preflight.test.ts \
  tests/unit/scripts/setup-origin-contract.test.ts \
  tests/unit/proxy-config.test.ts
```

Expected: all focused security tests pass.

- [ ] **Step 2: Run static and full unit gates**

```bash
corepack pnpm lint
corepack pnpm tsc --noEmit
corepack pnpm test
```

Expected: zero lint/type/test failures.

- [ ] **Step 3: Confirm ordered build and production security evidence**

Task 8 must already have run, in this order, on the same unchanged working tree:

```text
corepack pnpm build
CODEXMUX_PREAUTH_SMOKE_MODE=production corepack pnpm smoke:pre-auth-bootstrap
```

Expected: Next standalone/custom server build and its production security smoke pass.
If source changed after that evidence, rerun both commands now. Otherwise reuse it and
do not rebuild Next before the Electron build.

- [ ] **Step 4: Run Linux-required runtime gates**

```bash
CODEXMUX_PREAUTH_SMOKE_MODE=development corepack pnpm smoke:pre-auth-bootstrap
```

Expected: Linux legacy install PTY and development custom server attack smoke pass.

- [ ] **Step 5: Run Electron build and GUI-dependent gates**

Run the Electron build after the production standalone smoke because it rewrites
standalone packaging artifacts:

```bash
corepack pnpm build:electron
```

Check Chromium availability and `DISPLAY`/Wayland before:

```bash
corepack pnpm smoke:browser-reconnect
corepack pnpm smoke:electron:runtime-v2
```

Expected: Electron build passes. GUI smokes pass when the host has Chromium/display;
otherwise record the exact missing prerequisite as a verification limit.

- [ ] **Step 6: Classify Windows gates separately**

Linux `{ skipped: true }` output is not Windows evidence. On the current Linux host,
record these as deferred unless a Windows runner is available:

```bash
corepack pnpm smoke:windows:preflight
corepack pnpm smoke:windows:host-diagnostics
corepack pnpm smoke:windows:packaged-launch
```

On a Windows runner, all three must pass and the packaged launch must cover local
server bootstrap. Before packaged launch, run:

```bash
corepack pnpm pack:electron:dev
```

Assert `release/win-unpacked/codexmux.exe` was produced after the current source/build
start time so a stale artifact cannot satisfy the gate. Document Linux-required,
GUI-dependent and Windows-deferred groups in `docs/TESTING.md`.

- [ ] **Step 7: Run diff/security review**

Review the actual diff for:

- any path from invalid config to setup-open;
- any first-claim path without startup latch + authority;
- any preflight path that uses `needsSetup()` as admission by itself;
- any install path bypassing typed authorizer;
- any Next proxy matcher that still exempts `/api/install`;
- slot ownership changes after await;
- raw credentials/Origin/command in logs/errors;
- stale Node smoke setup calls without Origin;
- docs that overclaim proxy/elevated/multi-user protection.

Use `superpowers:requesting-code-review`, respond to findings with
`superpowers:receiving-code-review`, rerun affected tests, then run `git diff --check`.

## Plan Self-Review

- Spec coverage: every frozen requirement maps to Tasks 1-10.
- Placeholder scan: no TBD/TODO/"handle edge cases" step remains.
- Type consistency: `TStoredAuthState`, `TAuthBootstrapState`,
  `IBootstrapRuntimeState`, `TInstallRequestAuthorization`,
  `TInstallSetupLeaseState`, `IInstallWebSocketUpgradeContext`, `IInstallServer` are
  introduced before use.
- TDD ordering: each behavior task starts with RED tests and has a focused GREEN command.
- Scope: no UI, dependency or upload file is included.
- Rollback: no persistent schema migration; code revert restores old behavior. Corrupt config
  is preserved rather than rewritten, so rollback does not require data repair.
- Commit policy: no task contains a commit/push action.

## Plan Engineering Review

Status: passed on 2026-07-11. ADR-026 moved from `Review` to `Approved`.

### Review Findings And Resolutions

- Config/auth: canonical state replaces every setup admission predicate. Missing/invalid
  state is unavailable, preflight cannot reopen after claim, and `initShellPath()` remains
  in the dependency-injected server bootstrap composition.
- First claim: authority runs before lock; latch/state/session/input are rechecked inside
  the lock; config, auth env, access env and claim close have a fixed one-winner order.
- Routing: Next HTTP `/api/install` exception is removed. WebSocket install has a typed
  route and full-request outer guard with bounded 400/403/503 errors.
- PTY ownership: one install service instance owns WSS handling and shutdown. The
  partial-dependency factory has production defaults, atomic owner slot, explicit lease,
  frame/queue limits and stale-continuation tests.
- Testability: config, bootstrap composition, request authority, API admission, routing,
  execution races and smoke Origin callers all have focused tests before implementation.
- Live parity: development uses `tsx server.ts`; production uses built
  `bin/codexmux.js`. Port fallback reads the actual port file, and maxPayload is verified
  through a real 65,537-byte frame.
- Environment: root smoke first proves setup-open rejection and continues under valid
  INIT; Linux-required, GUI-dependent and Windows packaged gates are classified
  separately. Windows packaged evidence must be newly produced by `pack:electron:dev`.
- Performance: strict config reads occur only on bootstrap admission/lease paths. Queue
  memory is bounded to 1MiB per sole install connection; no new unbounded poller exists.
- Rollback: no schema migration or destructive config rewrite. Normal code revert restores
  behavior; preserved invalid config still requires operator recovery.

### DDD And Boundary Check

Folder/module names match the approved language: config integrity, bootstrap runtime,
request authority, install admission, upgrade routing and legacy install execution are
separate. Public types are introduced before use, and adapters own Node HTTP, process env,
WebSocket and PTY details without moving install into Runtime v2.

Engineering-blocking issue: none.
