#!/usr/bin/env node
import {
  DEFAULT_ANDROID_ACTIVITY,
  DEFAULT_ANDROID_APP_ID,
  DEFAULT_ANDROID_SMOKE_URL,
  adbArgsFor,
  attachConsoleCollectors,
  backgroundAndroidApp,
  clearAndroidAppData,
  clearLogcat,
  collectBlockingConsoleEvents,
  collectBlockingLogcatLines,
  connectCdp,
  discoverDevtoolsTarget,
  dumpLogcat,
  enableCdpDomains,
  evaluate,
  findAdb,
  forceStopAndroidApp,
  isExpectedRemoteState,
  navigateCdp,
  normalizeSmokeUrl,
  readWebViewState,
  removeForward,
  selectAndroidSerial,
  sleep,
  startAndroidApp,
  waitForExpectedRemoteState,
} from './android-webview-smoke-lib.mjs';

const envNumber = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
  return parsed;
};

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const getAndroidAppInfo = (cdp) =>
  evaluate(cdp, `(() => {
    const api = window.CodexmuxAndroid;
    if (!api) return null;
    return {
      versionName: api.getVersionName?.() || '-',
      versionCode: api.getVersionCode?.() || '-',
      packageName: api.getPackageName?.() || '-',
      deviceModel: api.getDeviceModel?.() || '-',
      androidVersion: api.getAndroidVersion?.() || '-',
      canRestart: typeof api.restartApp === 'function'
    };
  })()`);

const main = async () => {
  const targetUrl = normalizeSmokeUrl(process.env.CODEXMUX_ANDROID_SMOKE_URL || DEFAULT_ANDROID_SMOKE_URL);
  const backgroundMs = envNumber('CODEXMUX_ANDROID_BACKGROUND_MS', 12_000);
  const rounds = envNumber('CODEXMUX_ANDROID_FOREGROUND_ROUNDS', 2);
  const settleMs = envNumber('CODEXMUX_ANDROID_RECONNECT_SETTLE_MS', 3_000);
  const requestedPort = process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT
    ? Number(process.env.CODEXMUX_ANDROID_DEVTOOLS_PORT)
    : undefined;
  const appId = process.env.CODEXMUX_ANDROID_APP_ID || DEFAULT_ANDROID_APP_ID;
  const activity = process.env.CODEXMUX_ANDROID_ACTIVITY || DEFAULT_ANDROID_ACTIVITY;

  const adb = findAdb();
  const serial = selectAndroidSerial(adb);
  const adbArgs = adbArgsFor(serial);
  const consoleEvents = [];
  const checks = [];
  let cdp = null;
  let forward = null;

  const connectWebView = async () => {
    if (cdp) cdp.close();
    if (forward) removeForward({ adb, adbArgs, port: forward.port });
    forward = await discoverDevtoolsTarget({ adb, adbArgs, expectedUrl: targetUrl, requestedPort });
    cdp = await connectCdp(forward.target.webSocketDebuggerUrl);
    attachConsoleCollectors(cdp, consoleEvents);
    await enableCdpDomains(cdp);
    return cdp;
  };

  const ensureRemote = async (label) => {
    try {
      const state = await readWebViewState(cdp);
      if (!isExpectedRemoteState(state, targetUrl)) {
        await navigateCdp(cdp, targetUrl);
      }
      return await waitForExpectedRemoteState(cdp, targetUrl);
    } catch {
      await connectWebView();
      const state = await readWebViewState(cdp);
      if (!isExpectedRemoteState(state, targetUrl)) {
        await navigateCdp(cdp, targetUrl);
      }
      return await waitForExpectedRemoteState(cdp, targetUrl);
    } finally {
      checks.push(label);
    }
  };

  try {
    clearLogcat({ adb, adbArgs });
    if (process.env.CODEXMUX_ANDROID_CLEAR_APP_DATA === '1') {
      forceStopAndroidApp({ adb, adbArgs, appId });
      clearAndroidAppData({ adb, adbArgs, appId });
      checks.push('app-data-clear');
    }

    startAndroidApp({ adb, adbArgs, activity });
    await sleep(1_000);
    await connectWebView();
    const initialState = await ensureRemote('initial-remote-state');
    const appInfo = await getAndroidAppInfo(cdp);

    if (initialState.bridgeTriggerEventType !== 'function') {
      fail('android-trigger-event-fallback-missing', 'Capacitor triggerEvent fallback was not installed', { initialState });
    }
    if (!appInfo) {
      fail('android-app-info-bridge-missing', 'CodexmuxAndroid app info bridge is not available', { initialState });
    }

    for (let i = 0; i < rounds; i += 1) {
      backgroundAndroidApp({ adb, adbArgs });
      await sleep(backgroundMs);
      startAndroidApp({ adb, adbArgs, activity });
      const state = await ensureRemote(`foreground-round-${i + 1}`);
      await sleep(settleMs);
      const settledState = await waitForExpectedRemoteState(cdp, targetUrl);
      if (settledState.bridgeTriggerEventType !== 'function') {
        fail('android-trigger-event-fallback-missing-after-foreground', 'triggerEvent fallback disappeared after foreground reconnect', {
          round: i + 1,
          state,
          settledState,
        });
      }
    }

    const finalState = await waitForExpectedRemoteState(cdp, targetUrl);
    const blockingConsole = collectBlockingConsoleEvents(consoleEvents);
    const logcat = dumpLogcat({ adb, adbArgs });
    const blockingLogcat = collectBlockingLogcatLines(logcat);

    if (blockingConsole.length > 0 || blockingLogcat.length > 0) {
      fail('android-foreground-reconnect-failed', 'Android foreground reconnect produced blocking console or logcat errors', {
        targetUrl,
        serial,
        rounds,
        backgroundMs,
        blockingConsole,
        blockingLogcat: blockingLogcat.slice(0, 40),
        finalState,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      adb,
      serial,
      appId,
      activity,
      targetUrl,
      rounds,
      backgroundMs,
      checks,
      appInfo,
      initialHref: initialState.href,
      finalHref: finalState.href,
      consoleEventCount: consoleEvents.length,
      blockingConsoleCount: blockingConsole.length,
      blockingLogcatCount: blockingLogcat.length,
      devtools: forward,
    }, null, 2));
  } catch (err) {
    fail('android-foreground-smoke-error', err instanceof Error ? err.message : String(err), {
      targetUrl,
      serial,
      checks,
      consoleEvents: consoleEvents.slice(-20),
    });
  } finally {
    if (cdp) cdp.close();
    if (forward) removeForward({ adb, adbArgs, port: forward.port });
  }
};

main();
