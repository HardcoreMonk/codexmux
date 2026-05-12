import { BACKLOG_BATCHES, flattenBacklogBatches } from './ops-backlog-batch-plan-lib.mjs';

const RUNNABLE_EXECUTIONS = Object.freeze(['automated']);

const skipReasonFor = ({ execution, includeConditional }) => {
  if (execution === 'conditional' && !includeConditional) return 'conditional-not-included';
  return execution;
};

export const buildBacklogBatchRunPlan = ({
  batches = BACKLOG_BATCHES,
  includeConditional = false,
} = {}) => {
  const seenCommands = new Set();
  const commands = [];
  const executableItems = [];
  const skipped = [];
  const runnableExecutions = includeConditional
    ? [...RUNNABLE_EXECUTIONS, 'conditional']
    : RUNNABLE_EXECUTIONS;

  for (const item of flattenBacklogBatches(batches)) {
    const isRunnable = runnableExecutions.includes(item.execution) && item.commands.length > 0;
    if (!isRunnable) {
      skipped.push({
        batchId: item.batchId,
        batchTitle: item.batchTitle,
        slug: item.slug,
        title: item.title,
        execution: item.execution,
        skipReason: skipReasonFor({ execution: item.execution, includeConditional }),
      });
      continue;
    }

    executableItems.push({
      batchId: item.batchId,
      batchTitle: item.batchTitle,
      slug: item.slug,
      title: item.title,
      execution: item.execution,
      commands: item.commands,
    });

    for (const command of item.commands) {
      if (seenCommands.has(command)) continue;
      seenCommands.add(command);
      commands.push({
        command,
        batchId: item.batchId,
        batchTitle: item.batchTitle,
        firstItemSlug: item.slug,
        firstItemTitle: item.title,
        execution: item.execution,
      });
    }
  }

  return {
    includeConditional,
    summary: {
      executableItemCount: executableItems.length,
      skippedItemCount: skipped.length,
      commandCount: commands.length,
    },
    executableItems,
    skipped,
    commands,
  };
};

export const parseCorepackPnpmCommand = (command) => {
  const prefix = 'corepack pnpm ';
  if (!command.startsWith(prefix)) {
    throw new Error(`Unsupported command: ${command}`);
  }
  return command.slice(prefix.length).split(' ').filter(Boolean);
};

export const summarizeBatchRunResults = ({ planned, results }) => {
  const failed = results
    .filter((result) => result.status === 'failed')
    .map((result) => result.command);
  return {
    ok: failed.length === 0,
    commandCount: planned.commands.length,
    passedCount: results.filter((result) => result.status === 'passed').length,
    failedCount: failed.length,
    skippedItemCount: planned.skipped.length,
    failures: failed,
  };
};
