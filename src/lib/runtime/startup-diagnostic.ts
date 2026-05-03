export interface IRuntimeStartupDiagnosticSupervisor {
  health(): Promise<unknown>;
}

export interface IRuntimeStartupDiagnosticLogger {
  info(message: string): void;
  error(message: string): void;
}

export const runRuntimeStartupDiagnostic = (
  supervisor: IRuntimeStartupDiagnosticSupervisor,
  logger: IRuntimeStartupDiagnosticLogger,
): void => {
  void supervisor.health()
    .then(() => {
      logger.info('runtime v2 startup diagnostic passed');
    })
    .catch((err) => {
      logger.error(`runtime v2 startup diagnostic failed: ${err instanceof Error ? err.message : err}`);
    });
};
