#!/usr/bin/env node
import {
  DEFAULT_ANDROID_ACTIVITY,
  DEFAULT_ANDROID_APP_ID,
  DEFAULT_ANDROID_SMOKE_URL,
  adbArgsFor,
  attachConsoleCollectors,
  clearLogcat,
  collectBlockingConsoleEvents,
  collectBlockingLogcatLines,
  connectCdp,
  discoverDevtoolsTarget,
  dumpLogcat,
  enableCdpDomains,
  findAdb,
  forceStopAndroidApp,
  isExpectedRemoteState,
  navigateCdp,
  normalizeSmokeUrl,
  readWebViewState,
  reconnectLauncherToServer,
  removeForward,
  selectAndroidSerial,
  sleep,
  startAndroidApp,
  waitFor,
  waitForExpectedRemoteState,
  waitForLauncherState,
} from './android-webview-smoke-lib.mjs';

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const scenarioUrl = (scenario, targetUrl) => {
  if (scenario === 'network') return process.env.CODEXMUX_ANDROID_NETWORK_BAD_URL || 'http://127.0.0.1:1';
  if (scenario === 'http') return process.env.CODEXMUX_ANDROID_HTTP_BAD_URL || new URL('/__codexmux-smoke-http-404', targetUrl).toString();
  if (scenario === 'ssl') return process.env.CODEXMUX_ANDROID_SSL_BAD_URL || 'https://expired.badssl.com/';
  throw new Error(`unsupported recovery scenario: ${scenario}`);
};

const parseScenarios = () =>
  (process.env.CODEXMUX_ANDROID_RECOVERY_SCENARIOS || 'network,http,ssl')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const envNumber = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
  return parsed;
};

const main = async () => {
  const targetUrl = normalizeSmokeUrl(process.env.CODEXMUX_ANDROID_SMOKE_URL || DEFAULT_ANDROID_SMOKE_URL);
  const requestedPort = process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT
    ? Number(process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT)
    : undefined;
  const appId = process.env.CODEXMUX_ANDROID_APP_ID || DEFAULT_ANDROID_APP_ID;
  const activity = process.env.CODEXMUX_ANDROID_ACTIVITY || DEFAULT_ANDROID_ACTIVITY;
  const scenarios = parseScenarios();
  const settleMs = envNumber('CODEXMUX_ANDROID_RECOVERY_SETTLE_MS', 4_000);

  const adb = findAdb();
  const serial = selectAndroidSerial(adb);
  const adbArgs = adbArgsFor(serial);
  const consoleEvents = [];
  const checks = [];
  let cdp = null;
  let forward = null;
  let finalState = null;

  const connectWebView = async () => {
    if (cdp) cdp.close();
    if (forward) removeForward({ adb, adbArgs, port: forward.port });
    forward = await discoverDevtoolsTarget({ adb, adbArgs, expectedUrl: targetUrl, requestedPort });
    cdp = await connectCdp(forward.target.webSocketDebuggerUrl);
    attachConsoleCollectors(cdp, consoleEvents);
    await enableCdpDomains(cdp);
  };

  const navigateWithReconnect = async (url) => {
    try {
      await navigateCdp(cdp, url);
    } catch (err) {
      if (!String(err instanceof Error ? err.message : err).includes('CDP')) throw err;
      await connectWebView();
      await navigateCdp(cdp, url);
    }
  };

  const waitForRecoveredRemoteState = () =>
    waitFor('remote codexmux recovered page', async () => {
      const state = await readWebViewState(cdp);
      return isExpectedRemoteState(state, targetUrl) && state.bridgeTriggerEventType === 'function'
        ? state
        : null;
    }, 35_000);

  try {
    clearLogcat({ adb, adbArgs });
    forceStopAndroidApp({ adb, adbArgs, appId });
    startAndroidApp({ adb, adbArgs, activity });
    await sleep(1_000);
    await connectWebView();

    for (let i = 0; i < scenarios.length; i += 1) {
      const scenario = scenarios[i];
      if (i > 0) {
        forceStopAndroidApp({ adb, adbArgs, appId });
        startAndroidApp({ adb, adbArgs, activity });
        await sleep(1_000);
        await connectWebView();
        checks.push(`${scenario}-app-restart`);
      }

      const badUrl = scenarioUrl(scenario, targetUrl);
      await navigateWithReconnect(badUrl);
      const launcherState = await waitForLauncherState(cdp, 30_000);
      checks.push(`${scenario}-launcher`);

      await reconnectLauncherToServer(cdp, targetUrl);
      let recoveredState;
      try {
        await waitForExpectedRemoteState(cdp, targetUrl, 35_000);
        recoveredState = await waitForRecoveredRemoteState();
      } catch (err) {
        if (!String(err instanceof Error ? err.message : err).includes('CDP')) throw err;
        await sleep(1_000);
        await connectWebView();
        await waitForExpectedRemoteState(cdp, targetUrl, 35_000);
        recoveredState = await waitForRecoveredRemoteState();
      }
      finalState = recoveredState;
      checks.push(`${scenario}-recovered`);
      await sleep(settleMs);

      if (recoveredState.bridgeTriggerEventType !== 'function') {
        fail('android-trigger-event-fallback-missing-after-recovery', 'triggerEvent fallback was not installed after launcher recovery', {
          scenario,
          badUrl,
          launcherState,
          recoveredState,
        });
      }
    }

    const blockingConsole = collectBlockingConsoleEvents(consoleEvents);
    const logcat = dumpLogcat({ adb, adbArgs });
    const blockingLogcat = collectBlockingLogcatLines(logcat);

    if (blockingConsole.length > 0 || blockingLogcat.length > 0) {
      fail('android-launcher-recovery-failed', 'Android launcher recovery produced blocking console or logcat errors', {
        targetUrl,
        serial,
        scenarios,
        blockingConsole,
        blockingLogcat: blockingLogcat.slice(0, 40),
      });
    }

    console.log(JSON.stringify({
      ok: true,
      adb,
      serial,
      appId,
      activity,
      targetUrl,
      scenarios,
      settleMs,
      checks,
      finalHref: finalState?.href ?? null,
      consoleEventCount: consoleEvents.length,
      blockingConsoleCount: blockingConsole.length,
      blockingLogcatCount: blockingLogcat.length,
      devtools: forward,
    }, null, 2));
  } catch (err) {
    fail('android-launcher-recovery-smoke-error', err instanceof Error ? err.message : String(err), {
      targetUrl,
      serial,
      scenarios,
      checks,
      consoleEvents: consoleEvents.slice(-20),
    });
  } finally {
    if (cdp) cdp.close();
    if (forward) removeForward({ adb, adbArgs, port: forward.port });
  }
};

main();
