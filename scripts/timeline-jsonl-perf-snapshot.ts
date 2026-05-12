import fs from 'fs/promises';
import {
  buildTimelinePerfSnapshotReport,
  buildSyntheticCodexJsonl,
} from '../src/lib/timeline-jsonl-perf-snapshot';

interface IArgs {
  filePath: string | null;
  syntheticTurns: number | null;
}

const parseArgs = (argv: string[]): IArgs => {
  let filePath: string | null = null;
  let syntheticTurns: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--synthetic-turns') {
      syntheticTurns = Number.parseInt(argv[++i] ?? '', 10);
      continue;
    }
    if (arg === '--file') {
      filePath = argv[++i] ?? null;
      continue;
    }
    if (!arg.startsWith('--') && !filePath) {
      filePath = arg;
    }
  }

  return { filePath, syntheticTurns: Number.isFinite(syntheticTurns) ? syntheticTurns : null };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const syntheticTurns = args.syntheticTurns ?? 2_500;
  const content = args.filePath
    ? await fs.readFile(args.filePath, 'utf-8')
    : buildSyntheticCodexJsonl({ turns: syntheticTurns });

  console.log(JSON.stringify(buildTimelinePerfSnapshotReport({
    source: args.filePath ? 'file' : 'synthetic',
    syntheticTurns,
    content,
  }), null, 2));
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
