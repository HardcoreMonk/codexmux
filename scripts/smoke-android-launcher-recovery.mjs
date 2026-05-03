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
  navigateCdp,
  normalizeSmokeUrl,
  reconnectLauncherToServer,
  removeForward,
  selectAndroidSerial,
  sleep,
  startAndroidApp,
  waitForExpectedRemoteState,
  waitForLauncherState,
} from './android-webview-smoke-lib.mjs';

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const scenarioUrl = (scenario, targetUrl) => {
  if (scenario === 'network') return process.env.CODEXMUX_ANDROID_NETWORK_BAD_URL || 'http://127.0.0.1:1';
  if (scenario === 'http') return process.env.CODEXMUX_ANDROID_HTTP_BAD_URL || 'https://example.com/__codexmux-smoke-http-404';
  if (scenario === 'ssl') return process.env.CODEXMUX_ANDROID_SSL_BAD_URL || 'https://expired.badssl.com/';
  throw new Error(`unsupported recovery scenario: ${scenario}`);
};

const parseScenarios = () =>
  (process.env.CODEXMUX_ANDROID_RECOVERY_SCENARIOS || 'network,http,ssl')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const main = async () => {
  const targetUrl = normalizeSmokeUrl(process.env.CODEXMUX_ANDROID_SMOKE_URL || DEFAULT_ANDROID_SMOKE_URL);
  const requestedPort = process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT
    ? Number(process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT)
    : undefined;
  const appId = process.env.CODEXMUX_ANDROID_APP_ID || DEFAULT_ANDROID_APP_ID;
  const activity = process.env.CODEXMUX_ANDROID_ACTIVITY || DEFAULT_ANDROID_ACTIVITY;
  const scenarios = parseScenarios();

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

  try {
    clearLogcat({ adb, adbArgs });
    forceStopAndroidApp({ adb, adbArgs, appId });
    startAndroidApp({ adb, adbArgs, activity });
    await sleep(1_000);
    await connectWebView();

    for (const scenario of scenarios) {
      const badUrl = scenarioUrl(scenario, targetUrl);
      await navigateCdp(cdp, badUrl);
      const launcherState = await waitForLauncherState(cdp, 30_000);
      checks.push(`${scenario}-launcher`);

      await reconnectLauncherToServer(cdp, targetUrl);
      const recoveredState = await waitForExpectedRemoteState(cdp, targetUrl, 35_000);
      finalState = recoveredState;
      checks.push(`${scenario}-recovered`);
      await sleep(1_500);

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
