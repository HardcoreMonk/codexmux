#!/usr/bin/env node
import { buildLifecycleRollbackDryRun } from './lifecycle-rollback-dry-run-lib.mjs';

const main = async () => {
  const result = await buildLifecycleRollbackDryRun();
  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'lifecycle-rollback-dry-run-failed',
    message: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
