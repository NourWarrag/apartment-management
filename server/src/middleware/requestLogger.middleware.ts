import pinoHttp from 'pino-http';
import { v4 as uuid } from 'uuid';
import logger from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => uuid(),
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
