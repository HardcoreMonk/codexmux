import { cleanBuildArtifacts } from './clean-build-artifacts-lib.mjs';

const result = await cleanBuildArtifacts(process.cwd());
for (const target of result.removed) {
  console.log(`removed ${target}`);
}
