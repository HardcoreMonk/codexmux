import pino from 'pino';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.purplemux', 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const g = globalThis as unknown as { __ptRootLogger?: pino.Logger };

if (!g.__ptRootLogger) {
  g.__ptRootLogger = pino({
    level: LOG_LEVEL,
    transport: {
      targets: [
        {
          target: 'pino-roll',
          options: {
            file: path.join(LOG_DIR, 'purplemux'),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            limit: { count: 7 },
            mkdir: true,
          },
        },
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname,module',
            translateTime: 'HH:MM:ss',
            messageFormat: '[{module}] {msg}',
          },
        },
      ],
    },
  });
}

const rootLogger = g.__ptRootLogger;

export const createLogger = (module: string): pino.Logger =>
  rootLogger.child({ module });
