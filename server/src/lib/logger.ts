import pino from 'pino';
import path from 'path';
import fs from 'fs';

const isDev = process.env.NODE_ENV !== 'production';

const logsDir = path.resolve(__dirname, '../../logs');
if (!isDev && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transport = isDev
  ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
  : pino.transport({
      target: 'pino-roll',
      options: {
        file: path.join(logsDir, 'app.log'),
        frequency: 'daily',
        limit: { count: 7 },
        size: '50m',
      },
    });

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, transport);

export default logger;
