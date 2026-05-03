import { describe, expect, it } from 'vitest';

import nextConfig from '../../../next.config';

describe('next output file tracing config', () => {
  it('uses the documented global route glob for root-level build artifacts', () => {
    const excludes = nextConfig.outputFileTracingExcludes ?? {};
    const globalExcludes = excludes['/*'] ?? [];

    expect(excludes).not.toHaveProperty('*');
    expect(globalExcludes).toEqual(expect.arrayContaining([
      './next.config.ts',
      './android/**',
      './android-web/**',
      './_site/**',
      './dist/**',
      './dist-electron/**',
      './tsconfig.tsbuildinfo',
      './vitest.config.ts',
      './tsup.config.ts',
    ]));
  });
});
