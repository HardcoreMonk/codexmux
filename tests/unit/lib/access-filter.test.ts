import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHost = process.env.HOST;
const originalNetworkAccess = process.env.__CMUX_NETWORK_ACCESS;

const importAccessFilter = async () => {
  vi.resetModules();
  return import('@/lib/access-filter');
};

beforeEach(() => {
  delete process.env.HOST;
  delete process.env.__CMUX_NETWORK_ACCESS;
  vi.resetModules();
});

afterEach(() => {
  if (originalHost === undefined) delete process.env.HOST;
  else process.env.HOST = originalHost;
  if (originalNetworkAccess === undefined) delete process.env.__CMUX_NETWORK_ACCESS;
  else process.env.__CMUX_NETWORK_ACCESS = originalNetworkAccess;
  vi.resetModules();
});

describe('startup access filter', () => {
  it('forces setup startup to localhost ahead of HOST and config', async () => {
    process.env.HOST = '0.0.0.0';
    const access = await importAccessFilter();

    access.initAccessFilter({
      envHost: '0.0.0.0',
      networkAccess: 'all',
      setupRequiredAtStartup: true,
    });

    expect(access.getCurrentSpec().raw).toBe('localhost');
    expect(access.isRequestAllowed('127.0.0.1')).toBe(true);
    expect(access.isRequestAllowed('::1')).toBe(true);
    expect(access.isRequestAllowed('192.168.1.20')).toBe(false);
  });

  it('does not release setup restriction when config is updated in-process', async () => {
    const access = await importAccessFilter();
    access.initAccessFilter({ networkAccess: 'localhost', setupRequiredAtStartup: true });

    access.updateAccessFromConfig('all');

    expect(access.getCurrentSpec().raw).toBe('localhost');
    expect(access.isRequestAllowed('10.0.0.2')).toBe(false);
  });

  it('preserves configured HOST precedence', async () => {
    process.env.HOST = '0.0.0.0';
    const access = await importAccessFilter();

    access.initAccessFilter({
      envHost: '0.0.0.0',
      networkAccess: 'localhost',
      setupRequiredAtStartup: false,
    });

    expect(access.getCurrentSpec().allowAll).toBe(true);
  });

  it('preserves configured network selection and legacy default', async () => {
    const configured = await importAccessFilter();
    configured.initAccessFilter({ networkAccess: 'tailscale', setupRequiredAtStartup: false });
    expect(configured.getCurrentSpec().raw).toBe('localhost,tailscale');

    vi.resetModules();
    delete process.env.__CMUX_NETWORK_ACCESS;
    const legacy = await import('@/lib/access-filter');
    legacy.initAccessFilter({ networkAccess: undefined, setupRequiredAtStartup: false });
    expect(legacy.getCurrentSpec().allowAll).toBe(true);
  });

  it('invalidates the configured cache when network access changes', async () => {
    const access = await importAccessFilter();
    access.initAccessFilter({ networkAccess: 'localhost', setupRequiredAtStartup: false });
    expect(access.isRequestAllowed('192.168.1.20')).toBe(false);

    access.updateAccessFromConfig('all');

    expect(access.isRequestAllowed('192.168.1.20')).toBe(true);
  });
});
